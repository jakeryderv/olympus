# ADR 0004: V0 architecture proof

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

A large package graph could encode mythology before proving that the proposed seams are real.

## Decision

The first release is a safe read-only vertical slice. It includes the host kernel, Athena, independently swappable deterministic model and tool implementations, a CLI, an in-memory Thread, tests, and behavioral evals.

Acceptance requires configuration-only substitution of two Oracle implementations and two ToolCatalog implementations, stable semantic event types, dependency validation, fault-injected setup rollback, safe subsequent activation, and reverse-order shutdown.

Shell, writes, network effects, hot reload, and multi-agent execution are excluded.

## Alternatives

- Build the complete package-per-god graph first: rejected as premature abstraction.
- Add a trusted shell demo before safety controls: rejected because it would normalize the wrong effect boundary.

## Consequences

The v0 is intentionally limited but falsifiable. New packages are created only when an exercised contract or independent release cadence justifies them.
