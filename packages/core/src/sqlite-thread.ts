import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { and, asc, eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { threadEvents, threadHeads, threadSchema } from "./thread-schema.js";
import {
  appendEventHash,
  type AppendEvent,
  type AuditThread,
  redactAuditValue,
  serializeAuditValue,
  type SafeAuditValue,
  type ThreadEvent,
} from "./thread.js";

const CURRENT_MIGRATION_VERSION = 1;

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE thread_heads (
        thread_id TEXT PRIMARY KEY NOT NULL,
        next_sequence INTEGER DEFAULT 1 NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE thread_events (
        thread_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        payload_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        idempotency_key TEXT,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (thread_id, sequence),
        FOREIGN KEY (thread_id) REFERENCES thread_heads(thread_id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX thread_events_event_id_unique ON thread_events(event_id);
      CREATE UNIQUE INDEX thread_events_idempotency_unique
        ON thread_events(thread_id, idempotency_key);
    `,
  },
] as const;

export interface SqliteThreadOptions {
  readonly filename: string;
  readonly threadId?: string;
}

type ThreadEventRow = typeof threadEvents.$inferSelect;
type ThreadDatabase = BetterSQLite3Database<typeof threadSchema>;

function prepareDatabasePath(filename: string): string {
  if (filename === ":memory:") {
    return filename;
  }
  const absolutePath = resolve(filename);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

function parsePayload(payloadJson: string): SafeAuditValue {
  try {
    return JSON.parse(payloadJson) as SafeAuditValue;
  } catch (error) {
    throw new Error("Stored Thread event contains invalid JSON.", { cause: error });
  }
}

function rowToEvent(row: ThreadEventRow): ThreadEvent {
  const payload = parsePayload(row.payloadJson);
  return {
    threadId: row.threadId,
    eventId: row.eventId,
    sequence: row.sequence,
    type: row.type,
    timestamp: row.timestamp,
    actor: row.actor,
    correlationId: row.correlationId,
    ...(row.causationId === null ? {} : { causationId: row.causationId }),
    payload,
    schemaVersion: 1,
  };
}

export class SqliteThread implements AuditThread {
  readonly id: string;
  readonly #sqlite: BetterSqlite3.Database;
  readonly #db: ThreadDatabase;
  #closed = false;

  constructor(options: SqliteThreadOptions) {
    this.id = options.threadId ?? randomUUID();
    this.#sqlite = new BetterSqlite3(prepareDatabasePath(options.filename));
    this.#sqlite.pragma("foreign_keys = ON");
    this.#sqlite.pragma("busy_timeout = 5000");
    if (options.filename !== ":memory:") {
      this.#sqlite.pragma("journal_mode = WAL");
      this.#sqlite.pragma("synchronous = FULL");
    }
    this.#migrate();
    this.#db = drizzle(this.#sqlite, { schema: threadSchema });
  }

  append<T>(event: AppendEvent<T>): ThreadEvent<T> {
    this.#assertOpen();
    const payload = redactAuditValue(structuredClone(event.payload));
    const payloadJson = serializeAuditValue(payload);
    const contentHash = appendEventHash(event, payload);

    const transaction = this.#sqlite.transaction((): ThreadEvent<T> => {
      if (event.idempotencyKey !== undefined) {
        const existing = this.#db
          .select()
          .from(threadEvents)
          .where(
            and(
              eq(threadEvents.threadId, this.id),
              eq(threadEvents.idempotencyKey, event.idempotencyKey),
            ),
          )
          .get();
        if (existing !== undefined) {
          if (existing.contentHash !== contentHash) {
            throw new Error(
              `Idempotency key was reused with different content: ${event.idempotencyKey}`,
            );
          }
          return rowToEvent(existing) as ThreadEvent<T>;
        }
      }

      const now = new Date().toISOString();
      this.#db
        .insert(threadHeads)
        .values({ threadId: this.id, nextSequence: 1, createdAt: now })
        .onConflictDoNothing()
        .run();
      const head = this.#db
        .select({ nextSequence: threadHeads.nextSequence })
        .from(threadHeads)
        .where(eq(threadHeads.threadId, this.id))
        .get();
      if (head === undefined) {
        throw new Error(`Thread head was not created: ${this.id}`);
      }

      const envelope: ThreadEvent<T> = {
        threadId: this.id,
        eventId: randomUUID(),
        sequence: head.nextSequence,
        type: event.type,
        timestamp: now,
        actor: event.actor,
        correlationId: event.correlationId ?? randomUUID(),
        ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
        payload: payload as T,
        schemaVersion: 1,
      };
      this.#db
        .insert(threadEvents)
        .values({
          threadId: envelope.threadId,
          sequence: envelope.sequence,
          eventId: envelope.eventId,
          type: envelope.type,
          timestamp: envelope.timestamp,
          actor: envelope.actor,
          correlationId: envelope.correlationId,
          causationId: envelope.causationId,
          payloadJson,
          schemaVersion: envelope.schemaVersion,
          idempotencyKey: event.idempotencyKey,
          contentHash,
        })
        .run();
      this.#db
        .update(threadHeads)
        .set({ nextSequence: head.nextSequence + 1 })
        .where(eq(threadHeads.threadId, this.id))
        .run();
      return envelope;
    });

    return transaction();
  }

  snapshot(): readonly ThreadEvent[] {
    this.#assertOpen();
    return this.#db
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.threadId, this.id))
      .orderBy(asc(threadEvents.sequence))
      .all()
      .map(rowToEvent);
  }

  migrationVersion(): number {
    this.#assertOpen();
    const row = this.#sqlite
      .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM olympus_schema_migrations")
      .get() as { version: number };
    return row.version;
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#sqlite.close();
  }

  #migrate(): void {
    this.#sqlite.exec(`
      CREATE TABLE IF NOT EXISTS olympus_schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const appliedRows = this.#sqlite
      .prepare("SELECT version FROM olympus_schema_migrations")
      .all() as { version: number }[];
    const applied = new Set(appliedRows.map((row) => row.version));
    const runMigrations = this.#sqlite.transaction(() => {
      for (const migration of migrations) {
        if (applied.has(migration.version)) {
          continue;
        }
        this.#sqlite.exec(migration.sql);
        this.#sqlite
          .prepare("INSERT INTO olympus_schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(migration.version, new Date().toISOString());
      }
    });
    runMigrations();
    if (this.migrationVersion() !== CURRENT_MIGRATION_VERSION) {
      throw new Error("SQLite Thread migration did not reach the expected version.");
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("SQLite Thread is closed.");
    }
  }
}
