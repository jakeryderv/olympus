# ADR 0003: Thread audit semantics

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The architecture used replay, rewind, and branch terminology without defining whether external model and tool effects would execute again.

## Decision

A v0 Thread is an append-only event record for inspection and audit. Event envelopes are versioned and include stable identity, per-thread sequence, actor, correlation, timestamp, and redacted payload data.

Replay means reducing or rendering recorded events without repeating models or effects. Rewind will mean creating a branch from immutable history. Authorization is recorded before a privileged effect and the outcome afterward.

## Alternatives

- Deterministic re-execution: rejected for v0 because models and external effects are not deterministic or safely repeatable.
- Conversation transcript as sole state: rejected because it does not model authorization and effect outcomes precisely.

## Consequences

The first implementation may be in memory. Durable atomic persistence, schema migration, protected artifacts, retention, checkpoints, and branch execution require later decisions.
