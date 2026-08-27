# ADR 0005: Durable SQLite Threads

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

ADR 0003 defined Thread audit semantics but left durable storage, migrations, and crash consistency for later. Guarded effects require authorization and outcomes to survive process restarts.

## Decision

Olympus provides a local SQLite Thread implementation using Drizzle ORM and `better-sqlite3`. Each append runs in one SQLite transaction that allocates the next per-thread sequence, writes the event, and advances the head. WAL mode, full synchronous writes, foreign keys, and a busy timeout are enabled for file-backed stores.

Schema migrations are versioned and applied transactionally. Callers may supply an idempotency key; a repeated append returns the original event, while reuse with different redacted content fails closed. Payloads are redacted and serialized deterministically before persistence.

The in-memory implementation remains available for tests and disposable sessions.

## Alternatives

- JSON Lines: rejected because atomic sequence allocation, migrations, and indexed idempotency would require rebuilding database behavior.
- Node's experimental SQLite API: deferred until its supported runtime contract is sufficiently stable.
- A remote database: rejected for the local-first v0.

## Consequences

Olympus gains a native dependency and must test supported Node versions in CI. Closing a Thread makes later reads and appends fail explicitly. Retention, compaction, protected artifact storage, and multi-process stress testing remain future work.
