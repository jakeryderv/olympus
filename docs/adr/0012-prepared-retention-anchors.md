# ADR 0012: Prepared retention anchors and idempotency tombstones

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ADR 0011 defines a read-only retention plan but intentionally leaves event deletion disabled. Before a compactor can remove a prefix, the live store needs a durable trust anchor for the logical history that will no longer be present and a way to prevent idempotency keys from that prefix from executing again.

The current checkpoint algorithm begins at sequence 1, and SQLite deduplicates an idempotency key by reading its source event. Deleting that event without replacement state would make suffix verification impossible and could allow a previously authorized operation to be appended again.

## Decision

Olympus introduces **prepared retention anchors** as append-only host metadata. Preparing an anchor requires the same valid persisted checkpoint, protected artifact, and strict-prefix retention plan defined by ADR 0011. Preparation does not delete, rewrite, renumber, or hide any event.

Each prepared anchor copies the accepted checkpoint boundary and records its preparation time. Anchors for a Thread may only advance. Re-preparing the same boundary is idempotent when every field matches; moving backward or changing an existing boundary fails closed. The latest prepared anchor is the candidate boundary for a future compaction transaction.

Checkpoint chaining gains an anchor-aware form. The prepared anchor digest is the initial digest for the first retained event, whose sequence must be exactly one greater than the anchor boundary. The resulting checkpoint retains the logical total event count and original sequence numbers. Existing sequence-1 checkpoint and artifact formats remain unchanged.

Preparing an anchor also copies every idempotency key in the accepted prefix into an append-only tombstone table with its content hash, event ID, and sequence. Once tombstoned, reuse fails closed even while the original event still exists; Olympus does not replay or return an event that has been accepted for future compaction. A conflicting content hash also fails closed. Tombstones are not payload archives and cannot be removed by the future compactor.

The existing `thread_heads.next_sequence` remains authoritative. Preparing or verifying an anchor never derives a sequence from retained row count and never changes the head. Reopen and later appends therefore remain monotonic.

This slice exposes core storage and verification APIs only. A later destructive command must require the latest prepared anchor, re-run the protected-artifact retention plan in the deletion transaction, delete exactly the planned prefix, and install the anchor as the live history base atomically.

## Alternatives

- Treat the protected artifact as the only anchor: rejected because the live database needs an authoritative boundary for suffix verification and transactional compaction.
- Update one mutable anchor row: rejected because append-only prepared boundaries make monotonic advancement and audit inspection explicit.
- Preserve complete compacted events for idempotency: rejected because it defeats payload retention; tombstones keep only the minimum non-replay state.
- Allow same-content tombstone reuse: rejected because the original event may no longer be available and re-execution must fail closed.
- Delete in the preparation transaction: rejected because this slice exists to exercise anchor and tombstone invariants before destructive behavior.

## Consequences

SQLite gains a versioned migration for prepared anchors and idempotency tombstones. Preparing retention changes idempotent replay behavior for keys inside the prepared prefix from returning the original event to an explicit failure. Anchor-aware digest tests become prerequisites for compaction. No storage space is reclaimed in this slice, and all existing Thread events remain readable.
