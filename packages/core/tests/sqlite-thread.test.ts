import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteThread } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDatabase(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "olympus-thread-"));
  temporaryDirectories.push(directory);
  return join(directory, "threads.sqlite");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("SqliteThread", () => {
  it("migrates and persists ordered events across reopen", async () => {
    const filename = await temporaryDatabase();
    const threadId = "00000000-0000-4000-8000-000000000010";
    const first = new SqliteThread({ filename, threadId });
    expect(first.migrationVersion()).toBe(2);
    first.append({ type: "first", actor: "test", payload: { value: 1 } });
    first.append({ type: "second", actor: "test", payload: { value: 2 } });
    first.close();

    const reopened = new SqliteThread({ filename, threadId });
    expect(reopened.migrationVersion()).toBe(2);
    expect(reopened.snapshot().map((event) => [event.sequence, event.type])).toEqual([
      [1, "first"],
      [2, "second"],
    ]);
    reopened.close();
  });

  it("deduplicates idempotent appends and rejects key reuse with different content", async () => {
    const filename = await temporaryDatabase();
    const thread = new SqliteThread({ filename });
    const append = {
      type: "credential.observed",
      actor: "test",
      idempotencyKey: "request-1",
      payload: { token: "must-not-persist", visible: "yes" },
    } as const;

    const first = thread.append(append);
    const repeated = thread.append(append);
    expect(repeated).toEqual(first);
    expect(thread.snapshot()).toHaveLength(1);
    expect(thread.snapshot()[0]?.payload).toEqual({ token: "[REDACTED]", visible: "yes" });
    expect(() =>
      thread.append({
        ...append,
        payload: { token: "different", visible: "changed" },
      }),
    ).toThrow("Idempotency key was reused with different content");
    thread.close();
  });

  it("rolls back the sequence head when SQLite rejects an event", async () => {
    const filename = await temporaryDatabase();
    const thread = new SqliteThread({ filename });
    const sabotage = new BetterSqlite3(filename);
    sabotage.exec(`
      CREATE TRIGGER reject_thread_event
      BEFORE INSERT ON thread_events
      BEGIN
        SELECT RAISE(ABORT, 'injected append failure');
      END;
    `);
    sabotage.close();

    expect(() => thread.append({ type: "rejected", actor: "test", payload: {} })).toThrow(
      "injected append failure",
    );

    const repair = new BetterSqlite3(filename);
    repair.exec("DROP TRIGGER reject_thread_event");
    repair.close();
    const accepted = thread.append({ type: "accepted", actor: "test", payload: {} });
    expect(accepted.sequence).toBe(1);
    expect(thread.snapshot().map((event) => event.type)).toEqual(["accepted"]);
    thread.close();
  });

  it("persists immutable checkpoints and verifies committed prefixes", async () => {
    const filename = await temporaryDatabase();
    const threadId = "00000000-0000-4000-8000-000000000030";
    const thread = new SqliteThread({ filename, threadId });
    thread.append({ type: "first", actor: "test", payload: { value: 1 } });
    const checkpoint = thread.createCheckpoint();

    expect(thread.createCheckpoint()).toEqual(checkpoint);
    expect(thread.latestCheckpoint()).toEqual(checkpoint);
    expect(thread.checkpointAt(threadId, 1)).toEqual(checkpoint);
    expect(thread.checkpointAt(threadId, 2)).toBeUndefined();
    expect(thread.verifyCheckpoint(checkpoint)).toBe(true);

    thread.append({ type: "second", actor: "test", payload: { value: 2 } });
    expect(thread.verifyCheckpoint(checkpoint)).toBe(true);
    const later = thread.createCheckpoint();
    expect(later.throughSequence).toBe(2);
    thread.close();

    const reopened = new SqliteThread({ filename, threadId });
    expect(reopened.latestCheckpoint()).toEqual(later);
    expect(reopened.verifyCheckpoint(later)).toBe(true);
    reopened.close();
  });

  it("detects persisted event tampering against a checkpoint", async () => {
    const filename = await temporaryDatabase();
    const thread = new SqliteThread({ filename });
    thread.append({ type: "recorded", actor: "test", payload: { value: "original" } });
    const checkpoint = thread.createCheckpoint();

    const sabotage = new BetterSqlite3(filename);
    sabotage
      .prepare("UPDATE thread_events SET payload_json = ? WHERE thread_id = ?")
      .run('{"value":"tampered"}', thread.id);
    sabotage.close();

    expect(thread.verifyCheckpoint(checkpoint)).toBe(false);
    expect(() => thread.createCheckpoint()).toThrow("does not match the event history");
    thread.close();
  });

  it("fails explicitly after close", async () => {
    const thread = new SqliteThread({ filename: await temporaryDatabase() });
    thread.close();
    expect(() => thread.append({ type: "late", actor: "test", payload: {} })).toThrow(
      "SQLite Thread is closed",
    );
  });
});
