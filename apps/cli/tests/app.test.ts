/// <reference types="node" />

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteThread } from "@olympus/core";
import { afterEach, describe, expect, it } from "vitest";
import { main, type CliIo } from "../src/app.js";

const temporaryDirectories: string[] = [];

async function testContext() {
  const cwd = await mkdtemp(join(tmpdir(), "olympus-cli-"));
  temporaryDirectories.push(cwd);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo = {
    cwd,
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
  };
  return { cwd, stdout, stderr, io };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Olympus CLI", () => {
  it("persists a run and lists its Thread in human and JSON formats", async () => {
    const context = await testContext();
    const database = join(context.cwd, "threads.sqlite");

    expect(
      await main(
        ["run", "--model", "echo", "--tools", "fake", "--db", database, "hello"],
        context.io,
      ),
    ).toBe(0);
    const threadId = /Thread: ([0-9a-f-]+)/.exec(context.stdout.join(""))?.[1];
    expect(threadId).toBeDefined();

    context.stdout.length = 0;
    expect(await main(["thread", "list", "--db", database], context.io)).toBe(0);
    expect(context.stdout.join("")).toContain(`${threadId}\t3 events`);

    context.stdout.length = 0;
    expect(await main(["thread", "list", "--db", database, "--json"], context.io)).toBe(0);
    const output = JSON.parse(context.stdout.join("")) as {
      threads: { id: string; eventCount: number }[];
    };
    expect(output.threads).toEqual([expect.objectContaining({ id: threadId, eventCount: 3 })]);
    expect(context.stderr).toEqual([]);
  });

  it("renders replay without executing or appending events and preserves redaction", async () => {
    const context = await testContext();
    const database = join(context.cwd, "threads.sqlite");
    const threadId = "00000000-0000-4000-8000-000000000020";
    const thread = new SqliteThread({ filename: database, threadId });
    thread.append({
      type: "credential.observed",
      actor: "test",
      payload: { token: "must-not-render", visible: "yes" },
    });
    thread.close();

    expect(await main(["thread", "replay", threadId, "--db", database, "--json"], context.io)).toBe(
      0,
    );
    const output = JSON.parse(context.stdout.join("")) as {
      mode: string;
      events: { payload: { token: string; visible: string } }[];
    };
    expect(output.mode).toBe("render-only replay");
    expect(output.events[0]?.payload).toEqual({ token: "[REDACTED]", visible: "yes" });

    const reopened = new SqliteThread({ filename: database, threadId });
    expect(reopened.snapshot()).toHaveLength(1);
    reopened.close();
  });

  it("fails cleanly for an unknown Thread", async () => {
    const context = await testContext();
    expect(
      await main(
        ["thread", "show", "missing", "--db", join(context.cwd, "threads.sqlite")],
        context.io,
      ),
    ).toBe(1);
    expect(context.stderr.join("")).toContain("Thread not found: missing");
  });
});
