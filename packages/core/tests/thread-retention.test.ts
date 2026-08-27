import { describe, expect, it } from "vitest";
import {
  createThreadArtifact,
  createThreadCheckpoint,
  InMemoryThread,
  planThreadRetention,
} from "../src/index.js";

function retentionFixture() {
  const thread = new InMemoryThread("thread-retention");
  for (const type of ["first", "second", "third"] as const) {
    thread.append({ type, actor: "test", correlationId: "retention", payload: { type } });
  }
  const events = thread.snapshot();
  const boundaryEvents = events.slice(0, 2);
  const checkpoint = {
    ...createThreadCheckpoint(boundaryEvents),
    createdAt: "2026-08-27T00:00:00.000Z",
  } as const;
  const artifact = createThreadArtifact(boundaryEvents, checkpoint);
  return { events, checkpoint, artifact };
}

describe("Thread retention planning", () => {
  it("deterministically identifies exact removable and retained ranges", () => {
    const fixture = retentionFixture();
    const before = structuredClone(fixture.events);
    const plan = planThreadRetention(fixture.events, fixture.checkpoint, fixture.artifact);

    expect(plan).toEqual({
      schemaVersion: 1,
      mode: "dry-run",
      threadId: "thread-retention",
      boundary: fixture.checkpoint,
      removable: {
        firstSequence: 1,
        lastSequence: 2,
        firstEventId: fixture.events[0]?.eventId,
        lastEventId: fixture.events[1]?.eventId,
        eventCount: 2,
      },
      retained: {
        firstSequence: 3,
        lastSequence: 3,
        firstEventId: fixture.events[2]?.eventId,
        lastEventId: fixture.events[2]?.eventId,
        eventCount: 1,
      },
    });
    expect(planThreadRetention(fixture.events, fixture.checkpoint, fixture.artifact)).toEqual(plan);
    expect(fixture.events).toEqual(before);
  });

  it("fails closed for artifact, live-prefix, and terminal-boundary mismatches", () => {
    const fixture = retentionFixture();
    expect(() =>
      planThreadRetention(
        fixture.events,
        { ...fixture.checkpoint, digest: "0".repeat(64) },
        fixture.artifact,
      ),
    ).toThrow("does not match the persisted checkpoint");

    const first = fixture.events[0];
    if (first === undefined) {
      throw new Error("Expected a recorded event.");
    }
    expect(() =>
      planThreadRetention(
        [{ ...first, actor: "tampered" }, ...fixture.events.slice(1)],
        fixture.checkpoint,
        fixture.artifact,
      ),
    ).toThrow("does not match the live Thread prefix");

    const terminalCheckpoint = {
      ...createThreadCheckpoint(fixture.events),
      createdAt: "2026-08-27T00:00:01.000Z",
    } as const;
    expect(() =>
      planThreadRetention(
        fixture.events,
        terminalCheckpoint,
        createThreadArtifact(fixture.events, terminalCheckpoint),
      ),
    ).toThrow("requires at least one event after the checkpoint boundary");
  });
});
