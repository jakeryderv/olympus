# ADR 0010: Thread checkpoints and protected artifact export

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ADRs 0003 and 0005 define Threads as append-only, redacted audit records and persist them transactionally in SQLite. Operational use also needs a stable commitment to a recorded prefix and a way to move that history outside the live database without making replay executable or exposing a general write capability to models.

Deleting or compacting events before defining those commitments would weaken the current audit guarantees. A checkpoint cannot be appended to the Thread it covers because that event would change the history being committed and make the boundary recursive.

## Decision

Olympus defines a Thread checkpoint as an immutable SHA-256 commitment to a contiguous event prefix. The digest is a domain-separated chain over the canonical serialization of each complete event envelope, including identity, sequence, timestamp, actor, correlation and causation metadata, payload, and schema version. A checkpoint records its Thread ID, event count, terminal sequence, terminal event ID, digest algorithm, digest, schema version, and creation time.

Durable checkpoints live in a host-owned SQLite side table rather than in the event stream. Creating the same checkpoint boundary again is idempotent; an existing record with different commitment data fails closed. Verification recomputes the committed prefix from persisted events and uses constant-time digest comparison. Later events do not invalidate an earlier checkpoint.

A protected Thread artifact contains exactly one checkpoint and the complete redacted event prefix committed by it. The artifact uses a versioned, canonical JSON format and is data only: it cannot be imported as a live Thread and verification never invokes agents, models, tools, or effects.

The explicit CLI export command is a user-originated host operation, not a model-requested effect. It writes a completed artifact to a temporary file in the destination directory, flushes it, publishes it without replacing an existing path, and requests owner-only file permissions. Export does not add a shell, arbitrary plugin write, or model write capability.

The initial commands are:

- `thread checkpoint <thread-id>` to persist the current prefix commitment;
- `thread verify <thread-id>` to verify the latest persisted checkpoint against the database;
- `thread export <thread-id> --output <path>` to checkpoint and export the current prefix;
- `thread verify-artifact <path>` to verify an exported artifact offline.

Retention and compaction remain deferred. A later retention ADR must define checkpoint pinning, export ownership, policy, failure recovery, and how retained suffixes use a prior checkpoint as their trust anchor before any event can be removed.

## Alternatives

- Append checkpoint events to the covered Thread: rejected because the commitment boundary becomes recursive and mixes audit facts with storage metadata.
- Hash only payloads or existing idempotency hashes: rejected because reordered, omitted, or envelope-modified events could escape detection.
- Export the SQLite database directly: rejected because it couples artifacts to live migrations, includes unrelated Threads, and does not provide a bounded portable commitment.
- Overwrite exports in place: rejected because a failed write could destroy the only protected copy and because accidental replacement should fail closed.
- Implement retention in the same slice: rejected until checkpoint anchoring and protected export behavior are exercised.

## Consequences

Checkpoint and artifact schemas become public host contracts and require versioning. SQLite gains a transactional migration and immutable side records. Canonical serialization and digest behavior require tamper, ordering, prefix, redaction, and compatibility tests. Protected export introduces an explicit host filesystem write path, but it remains outside model control and narrower than a general write effect.
