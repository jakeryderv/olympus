import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createThreadArtifact,
  createThreadCheckpoint,
  InMemoryThread,
  parseThreadArtifact,
  serializeThreadArtifact,
  verifyThreadCheckpoint,
  writeThreadArtifact,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "olympus-artifact-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function recordedEvents() {
  const thread = new InMemoryThread("thread-1");
  thread.append({
    type: "credential.observed",
    actor: "test",
    correlationId: "correlation-1",
    payload: { token: "must-not-export", visible: "yes" },
  });
  thread.append({
    type: "quest.completed",
    actor: "test",
    correlationId: "correlation-1",
    payload: { answer: "done" },
  });
  return thread.snapshot();
}

describe("Thread checkpoints and artifacts", () => {
  it("commits to complete ordered event envelopes", () => {
    const events = recordedEvents();
    const checkpoint = createThreadCheckpoint(events);

    expect(verifyThreadCheckpoint(events, checkpoint)).toBe(true);
    expect(verifyThreadCheckpoint(events.slice(0, 1), checkpoint)).toBe(false);
    expect(verifyThreadCheckpoint([...events].reverse(), checkpoint)).toBe(false);
    const first = events[0];
    const second = events[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected two recorded events.");
    }
    expect(verifyThreadCheckpoint([{ ...first, actor: "tampered" }, second], checkpoint)).toBe(
      false,
    );
  });

  it("serializes deterministic redacted artifacts and detects tampering", () => {
    const events = recordedEvents();
    const checkpoint = {
      ...createThreadCheckpoint(events),
      createdAt: "2026-08-27T00:00:00.000Z",
    } as const;
    const artifact = createThreadArtifact(events, checkpoint);
    const serialized = serializeThreadArtifact(artifact);

    expect(serialized).not.toContain("must-not-export");
    expect(serialized).toContain("[REDACTED]");
    expect(serializeThreadArtifact(parseThreadArtifact(serialized))).toBe(serialized);

    const tampered = serialized.replace('"answer":"done"', '"answer":"changed"');
    expect(() => parseThreadArtifact(tampered)).toThrow("failed checkpoint verification");
  });

  it("publishes owner-only artifacts without replacing an existing path", async () => {
    const directory = await temporaryDirectory();
    const destination = join(directory, "thread.json");
    const events = recordedEvents();
    const artifact = createThreadArtifact(events, {
      ...createThreadCheckpoint(events),
      createdAt: "2026-08-27T00:00:00.000Z",
    });

    await expect(writeThreadArtifact(destination, artifact)).resolves.toBe(destination);
    expect((await stat(destination)).mode & 0o777).toBe(0o600);
    const original = await readFile(destination, "utf8");
    await expect(writeThreadArtifact(destination, artifact)).rejects.toThrow("already exists");
    expect(await readFile(destination, "utf8")).toBe(original);
  });
});
