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
    expect(first.migrationVersion()).toBe(1);
    first.append({ type: "first", actor: "test", payload: { value: 1 } });
    first.append({ type: "second", actor: "test", payload: { value: 2 } });
    first.close();

    const reopened = new SqliteThread({ filename, threadId });
    expect(reopened.migrationVersion()).toBe(1);
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

  it("fails explicitly after close", async () => {
    const thread = new SqliteThread({ filename: await temporaryDatabase() });
    thread.close();
    expect(() => thread.append({ type: "late", actor: "test", payload: {} })).toThrow(
      "SQLite Thread is closed",
    );
  });
});
