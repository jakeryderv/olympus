import { randomUUID } from "node:crypto";

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
  readonly payload: T;
}

export interface AuditSink {
  append<T>(event: AppendEvent<T>): ThreadEvent<T>;
}

const sensitiveKey = /authorization|credential|password|secret|token/i;

type SafeAuditValue =
  | null
  | boolean
  | number
  | string
  | undefined
  | readonly SafeAuditValue[]
  | { readonly [key: string]: SafeAuditValue };

function redact(value: unknown, seen = new WeakSet<object>()): SafeAuditValue {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
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
    sensitiveKey.test(key) ? "[REDACTED]" : redact(item, seen),
  ]);
  return Object.fromEntries(entries);
}

export class InMemoryThread implements AuditSink {
  readonly id: string;
  readonly #events: ThreadEvent[] = [];

  constructor(id: string = randomUUID()) {
    this.id = id;
  }

  append<T>(event: AppendEvent<T>): ThreadEvent<T> {
    const envelope: ThreadEvent<T> = Object.freeze({
      threadId: this.id,
      eventId: randomUUID(),
      sequence: this.#events.length + 1,
      type: event.type,
      timestamp: new Date().toISOString(),
      actor: event.actor,
      correlationId: event.correlationId ?? randomUUID(),
      ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
      payload: redact(structuredClone(event.payload)) as T,
      schemaVersion: 1,
    });
    this.#events.push(envelope);
    return envelope;
  }

  snapshot(): readonly ThreadEvent[] {
    return structuredClone(this.#events);
  }
}
