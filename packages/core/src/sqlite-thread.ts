import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { and, asc, count, desc, eq, lte } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  threadCheckpoints,
  threadEvents,
  threadHeads,
  threadIdempotencyTombstones,
  threadRetentionAnchors,
  threadSchema,
} from "./thread-schema.js";
import {
  createThreadCheckpoint,
  type PersistedThreadCheckpoint,
  type ProtectedThreadArtifact,
  verifyThreadCheckpoint,
} from "./thread-artifact.js";
import { planThreadRetention, type PreparedThreadRetentionAnchor } from "./thread-retention.js";
import {
  appendEventHash,
  type AppendEvent,
  type AuditThread,
  redactAuditValue,
  serializeAuditValue,
  type SafeAuditValue,
  type ThreadEvent,
} from "./thread.js";

const CURRENT_MIGRATION_VERSION = 3;

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
  {
    version: 2,
    sql: `
      CREATE TABLE thread_checkpoints (
        thread_id TEXT NOT NULL,
        through_sequence INTEGER NOT NULL,
        through_event_id TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        digest TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, through_sequence),
        FOREIGN KEY (thread_id) REFERENCES thread_heads(thread_id)
      );
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE thread_retention_anchors (
        thread_id TEXT NOT NULL,
        through_sequence INTEGER NOT NULL,
        through_event_id TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        digest TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        checkpoint_created_at TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, through_sequence),
        FOREIGN KEY (thread_id) REFERENCES thread_heads(thread_id)
      );
      CREATE TABLE thread_idempotency_tombstones (
        thread_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        event_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        prepared_at TEXT NOT NULL,
        PRIMARY KEY (thread_id, idempotency_key),
        FOREIGN KEY (thread_id) REFERENCES thread_heads(thread_id)
      );
    `,
  },
] as const;

export interface SqliteThreadOptions {
  readonly filename: string;
  readonly threadId?: string;
}

export interface ThreadSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly eventCount: number;
}

type ThreadEventRow = typeof threadEvents.$inferSelect;
type ThreadCheckpointRow = typeof threadCheckpoints.$inferSelect;
type ThreadRetentionAnchorRow = typeof threadRetentionAnchors.$inferSelect;
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

function rowToCheckpoint(row: ThreadCheckpointRow): PersistedThreadCheckpoint {
  if (row.algorithm !== "sha256" || row.schemaVersion !== 1) {
    throw new Error("Stored Thread checkpoint uses an unsupported schema.");
  }
  return {
    threadId: row.threadId,
    throughSequence: row.throughSequence,
    throughEventId: row.throughEventId,
    eventCount: row.eventCount,
    algorithm: row.algorithm,
    digest: row.digest,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt,
  };
}

function rowToRetentionAnchor(row: ThreadRetentionAnchorRow): PreparedThreadRetentionAnchor {
  if (row.algorithm !== "sha256" || row.schemaVersion !== 1) {
    throw new Error("Stored Thread retention anchor uses an unsupported schema.");
  }
  return {
    threadId: row.threadId,
    throughSequence: row.throughSequence,
    throughEventId: row.throughEventId,
    eventCount: row.eventCount,
    algorithm: row.algorithm,
    digest: row.digest,
    schemaVersion: row.schemaVersion,
    createdAt: row.checkpointCreatedAt,
    preparedAt: row.preparedAt,
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
        const tombstone = this.#db
          .select()
          .from(threadIdempotencyTombstones)
          .where(
            and(
              eq(threadIdempotencyTombstones.threadId, this.id),
              eq(threadIdempotencyTombstones.idempotencyKey, event.idempotencyKey),
            ),
          )
          .get();
        if (tombstone !== undefined) {
          if (tombstone.contentHash !== contentHash) {
            throw new Error(
              `Idempotency key was reused with different content: ${event.idempotencyKey}`,
            );
          }
          throw new Error(
            `Idempotency key belongs to a prepared retention prefix and cannot be replayed: ${event.idempotencyKey}`,
          );
        }
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
    return this.readThread(this.id);
  }

  readThread(threadId: string): readonly ThreadEvent[] {
    this.#assertOpen();
    return this.#db
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId))
      .orderBy(asc(threadEvents.sequence))
      .all()
      .map(rowToEvent);
  }

  listThreads(): readonly ThreadSummary[] {
    this.#assertOpen();
    return this.#db
      .select({
        id: threadHeads.threadId,
        createdAt: threadHeads.createdAt,
        eventCount: count(threadEvents.eventId),
      })
      .from(threadHeads)
      .leftJoin(threadEvents, eq(threadHeads.threadId, threadEvents.threadId))
      .groupBy(threadHeads.threadId, threadHeads.createdAt)
      .orderBy(desc(threadHeads.createdAt))
      .all()
      .map((row) => ({ ...row, eventCount: Number(row.eventCount) }));
  }

  createCheckpoint(threadId: string = this.id): PersistedThreadCheckpoint {
    this.#assertOpen();
    const transaction = this.#sqlite.transaction(() => {
      const events = this.#readThreadThrough(threadId, Number.MAX_SAFE_INTEGER);
      const checkpoint = createThreadCheckpoint(events);
      const existing = this.#db
        .select()
        .from(threadCheckpoints)
        .where(
          and(
            eq(threadCheckpoints.threadId, threadId),
            eq(threadCheckpoints.throughSequence, checkpoint.throughSequence),
          ),
        )
        .get();
      if (existing !== undefined) {
        const persisted = rowToCheckpoint(existing);
        if (!verifyThreadCheckpoint(events, persisted)) {
          throw new Error("Stored Thread checkpoint does not match the event history.");
        }
        return persisted;
      }

      const persisted: PersistedThreadCheckpoint = {
        ...checkpoint,
        createdAt: new Date().toISOString(),
      };
      this.#db.insert(threadCheckpoints).values(persisted).run();
      return persisted;
    });
    return transaction.immediate();
  }

  latestCheckpoint(threadId: string = this.id): PersistedThreadCheckpoint | undefined {
    this.#assertOpen();
    const row = this.#db
      .select()
      .from(threadCheckpoints)
      .where(eq(threadCheckpoints.threadId, threadId))
      .orderBy(desc(threadCheckpoints.throughSequence))
      .get();
    return row === undefined ? undefined : rowToCheckpoint(row);
  }

  checkpointAt(threadId: string, throughSequence: number): PersistedThreadCheckpoint | undefined {
    this.#assertOpen();
    const row = this.#db
      .select()
      .from(threadCheckpoints)
      .where(
        and(
          eq(threadCheckpoints.threadId, threadId),
          eq(threadCheckpoints.throughSequence, throughSequence),
        ),
      )
      .get();
    return row === undefined ? undefined : rowToCheckpoint(row);
  }

  prepareRetentionAnchor(artifact: ProtectedThreadArtifact): PreparedThreadRetentionAnchor {
    this.#assertOpen();
    const checkpoint = this.checkpointAt(
      artifact.checkpoint.threadId,
      artifact.checkpoint.throughSequence,
    );
    if (checkpoint === undefined) {
      throw new Error(
        `No persisted checkpoint for Thread ${artifact.checkpoint.threadId} at sequence ${artifact.checkpoint.throughSequence}.`,
      );
    }
    const transaction = this.#sqlite.transaction(() => {
      const events = this.#readThreadThrough(checkpoint.threadId, Number.MAX_SAFE_INTEGER);
      planThreadRetention(events, checkpoint, artifact);
      const latestRow = this.#db
        .select()
        .from(threadRetentionAnchors)
        .where(eq(threadRetentionAnchors.threadId, checkpoint.threadId))
        .orderBy(desc(threadRetentionAnchors.throughSequence))
        .get();
      if (latestRow !== undefined) {
        const latest = rowToRetentionAnchor(latestRow);
        if (latest.throughSequence > checkpoint.throughSequence) {
          throw new Error("Thread retention anchors cannot move backward.");
        }
        if (latest.throughSequence === checkpoint.throughSequence) {
          if (
            latest.threadId !== checkpoint.threadId ||
            latest.eventCount !== checkpoint.eventCount ||
            latest.algorithm !== checkpoint.algorithm ||
            latest.digest !== checkpoint.digest ||
            latest.throughEventId !== checkpoint.throughEventId ||
            latest.schemaVersion !== checkpoint.schemaVersion ||
            latest.createdAt !== checkpoint.createdAt
          ) {
            throw new Error("Prepared Thread retention anchor does not match the checkpoint.");
          }
          return latest;
        }
      }

      const preparedAt = new Date().toISOString();
      const prefixRows = this.#db
        .select()
        .from(threadEvents)
        .where(
          and(
            eq(threadEvents.threadId, checkpoint.threadId),
            lte(threadEvents.sequence, checkpoint.throughSequence),
          ),
        )
        .all();
      for (const row of prefixRows) {
        if (row.idempotencyKey === null) {
          continue;
        }
        const existing = this.#db
          .select()
          .from(threadIdempotencyTombstones)
          .where(
            and(
              eq(threadIdempotencyTombstones.threadId, row.threadId),
              eq(threadIdempotencyTombstones.idempotencyKey, row.idempotencyKey),
            ),
          )
          .get();
        if (existing !== undefined) {
          if (
            existing.contentHash !== row.contentHash ||
            existing.eventId !== row.eventId ||
            existing.sequence !== row.sequence
          ) {
            throw new Error(`Idempotency tombstone does not match event: ${row.idempotencyKey}`);
          }
          continue;
        }
        this.#db
          .insert(threadIdempotencyTombstones)
          .values({
            threadId: row.threadId,
            idempotencyKey: row.idempotencyKey,
            contentHash: row.contentHash,
            eventId: row.eventId,
            sequence: row.sequence,
            preparedAt,
          })
          .run();
      }

      const anchor: PreparedThreadRetentionAnchor = { ...checkpoint, preparedAt };
      this.#db
        .insert(threadRetentionAnchors)
        .values({
          threadId: anchor.threadId,
          throughSequence: anchor.throughSequence,
          throughEventId: anchor.throughEventId,
          eventCount: anchor.eventCount,
          algorithm: anchor.algorithm,
          digest: anchor.digest,
          schemaVersion: anchor.schemaVersion,
          checkpointCreatedAt: anchor.createdAt,
          preparedAt: anchor.preparedAt,
        })
        .run();
      return anchor;
    });
    return transaction.immediate();
  }

  latestRetentionAnchor(threadId: string = this.id): PreparedThreadRetentionAnchor | undefined {
    this.#assertOpen();
    const row = this.#db
      .select()
      .from(threadRetentionAnchors)
      .where(eq(threadRetentionAnchors.threadId, threadId))
      .orderBy(desc(threadRetentionAnchors.throughSequence))
      .get();
    return row === undefined ? undefined : rowToRetentionAnchor(row);
  }

  verifyCheckpoint(checkpoint: PersistedThreadCheckpoint): boolean {
    this.#assertOpen();
    const events = this.#readThreadThrough(checkpoint.threadId, checkpoint.throughSequence);
    return verifyThreadCheckpoint(events, checkpoint);
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

  #readThreadThrough(threadId: string, throughSequence: number): readonly ThreadEvent[] {
    return this.#db
      .select()
      .from(threadEvents)
      .where(and(eq(threadEvents.threadId, threadId), lte(threadEvents.sequence, throughSequence)))
      .orderBy(asc(threadEvents.sequence))
      .all()
      .map(rowToEvent);
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("SQLite Thread is closed.");
    }
  }
}
