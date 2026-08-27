import { createHash, randomUUID } from "node:crypto";

export interface ThreadEvent<T = unknown> {
  readonly threadId: string;
  readonly eventId: string;
  readonly sequence: number;
  readonly type: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: T;
  readonly schemaVersion: 1;
}

export interface AppendEvent<T = unknown> {
  readonly type: string;
  readonly actor: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly idempotencyKey?: string;
  readonly payload: T;
}

export interface AuditSink {
  append<T>(event: AppendEvent<T>): ThreadEvent<T>;
}

export interface ThreadReader {
  snapshot(): readonly ThreadEvent[];
}

export interface AuditThread extends AuditSink, ThreadReader {
  readonly id: string;
}

const sensitiveKey = /authorization|credential|password|secret|token/i;

export type SafeAuditValue =
  | null
  | boolean
  | number
  | string
  | undefined
  | readonly SafeAuditValue[]
  | { readonly [key: string]: SafeAuditValue };

export function redactAuditValue(value: unknown, seen = new WeakSet<object>()): SafeAuditValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item, seen));
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  const entries = Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? "[REDACTED]" : redactAuditValue(item, seen),
  ]);
  return Object.fromEntries(entries);
}

export function serializeAuditValue(value: SafeAuditValue): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeAuditValue(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${serializeAuditValue(item)}`)
    .join(",")}}`;
}

export function appendEventHash<T>(event: AppendEvent<T>, payload: SafeAuditValue): string {
  return createHash("sha256")
    .update(
      serializeAuditValue({
        actor: event.actor,
        causationId: event.causationId,
        correlationId: event.correlationId,
        payload,
        type: event.type,
      }),
    )
    .digest("hex");
}

interface IdempotentEvent {
  readonly contentHash: string;
  readonly event: ThreadEvent;
}

export class InMemoryThread implements AuditThread {
  readonly id: string;
  readonly #events: ThreadEvent[] = [];
  readonly #idempotency = new Map<string, IdempotentEvent>();

  constructor(id: string = randomUUID()) {
    this.id = id;
  }

  append<T>(event: AppendEvent<T>): ThreadEvent<T> {
    const payload = redactAuditValue(structuredClone(event.payload));
    const contentHash = appendEventHash(event, payload);
    if (event.idempotencyKey !== undefined) {
      const existing = this.#idempotency.get(event.idempotencyKey);
      if (existing !== undefined) {
        if (existing.contentHash !== contentHash) {
          throw new Error(
            `Idempotency key was reused with different content: ${event.idempotencyKey}`,
          );
        }
        return structuredClone(existing.event) as ThreadEvent<T>;
      }
    }

    const envelope: ThreadEvent<T> = Object.freeze({
      threadId: this.id,
      eventId: randomUUID(),
      sequence: this.#events.length + 1,
      type: event.type,
      timestamp: new Date().toISOString(),
      actor: event.actor,
      correlationId: event.correlationId ?? randomUUID(),
      ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
      payload: payload as T,
      schemaVersion: 1,
    });
    this.#events.push(envelope);
    if (event.idempotencyKey !== undefined) {
      this.#idempotency.set(event.idempotencyKey, { contentHash, event: envelope });
    }
    return envelope;
  }

  snapshot(): readonly ThreadEvent[] {
    return structuredClone(this.#events);
  }
}
