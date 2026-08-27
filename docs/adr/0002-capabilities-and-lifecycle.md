# ADR 0002: Capability and lifecycle semantics

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The initial sketch did not define capability identity, multiplicity, dependency cycles, setup rollback, or disposal ordering.

## Decision

V0 uses process-local typed capability keys and exactly one provider per key. Plugins declare requirements and provisions before setup. Olympus rejects missing or duplicate providers and dependency cycles before activation.

Setup follows dependency order. A failed composition disposes resources from that attempt in reverse order, continues cleanup after teardown errors, and preserves the setup failure as the root cause. Normal shutdown disposes each registered resource at most once in reverse order.

## Alternatives

- String-only service lookup: rejected because collisions are too easy.
- Multiple providers and runtime selection: deferred until a concrete use case exists.
- Hot unload and replacement: deferred.

## Consequences

Plugin boundaries are deterministic and testable. Capability version negotiation, scoped registries, dynamic unloading, and concurrent composition remain unsupported.
