import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const threadHeads = sqliteTable("thread_heads", {
  threadId: text("thread_id").primaryKey(),
  nextSequence: integer("next_sequence").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const threadCheckpoints = sqliteTable(
  "thread_checkpoints",
  {
    threadId: text("thread_id")
      .notNull()
      .references(() => threadHeads.threadId),
    throughSequence: integer("through_sequence").notNull(),
    throughEventId: text("through_event_id").notNull(),
    eventCount: integer("event_count").notNull(),
    algorithm: text("algorithm").notNull(),
    digest: text("digest").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.threadId, table.throughSequence] })],
);

export const threadEvents = sqliteTable(
  "thread_events",
  {
    threadId: text("thread_id")
      .notNull()
      .references(() => threadHeads.threadId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    timestamp: text("timestamp").notNull(),
    actor: text("actor").notNull(),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    payloadJson: text("payload_json").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    idempotencyKey: text("idempotency_key"),
    contentHash: text("content_hash").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.sequence] }),
    uniqueIndex("thread_events_event_id_unique").on(table.eventId),
    uniqueIndex("thread_events_idempotency_unique").on(table.threadId, table.idempotencyKey),
  ],
);

export const threadSchema = { threadCheckpoints, threadEvents, threadHeads };
