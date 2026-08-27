# Olympus Architecture

## Purpose

Olympus is a plugin-first AI agent harness. It provides a small host runtime that composes a Pantheon of replaceable agent behaviors.

The governing rule is:

> **All agent behavior is replaceable; composition and trust enforcement are kernel responsibilities.**

This replaces the overly broad claim that literally everything is a plugin. A replaceable peer plugin cannot be the non-bypassable security boundary for other in-process code.

## Trust model

The v0 model is intentionally narrow:

- every plugin declares `trusted-in-process` or `isolated-subprocess` in a validated manifest;
- in-process plugin code is trusted application code;
- the in-process host rejects isolated plugins until an out-of-process loader exists;
- model output and model-requested effects are untrusted;
- every model-requested effect must pass through the host-owned effect broker;
- v0 permits read-only effects and denies privileged effects;
- untrusted third-party plugins require a future out-of-process boundary.

Olympus does not claim to sandbox trusted in-process plugins from direct Node.js APIs. Package installation remains a supply-chain trust decision.

## Host responsibilities

The host kernel owns mechanisms that plugins must not bypass:

- plugin admission and trust classification;
- capability-registry integrity;
- dependency resolution;
- setup, rollback, cancellation, and disposal;
- the effect invocation path and final authorization decision;
- credential release through the host-owned broker and future approval-token validation;
- authoritative authorization and effect-audit events.

Replaceable plugins may provide policy evaluation, model adapters, tool implementations, orchestration, storage, sandbox backends, interfaces, and observability consumers. A host-owned broker invokes those implementations.

## Current vertical slice

```text
CLI
 └─ Olympus host
     ├─ typed capability registry
     ├─ dependency/lifecycle engine
     ├─ host effect broker ── read-only policy
     ├─ host credential broker
     └─ append-only Thread
         └─ Pantheon
             ├─ Athena agent runner
             ├─ replaceable Oracle/model adapter
             └─ replaceable ToolCatalog
                 └─ brokered read-only effects
```

The repository separates host mechanisms, neutral contracts, and replaceable behavior:

```text
apps/
  cli/                       composition root and user interface
packages/
  core/                      host kernel, lifecycle, brokers, and Thread
  contracts/                 neutral Oracle, ToolCatalog, and AgentRunner contracts
plugins/
  agents/
    athena/                  default orchestration implementation
  providers/
    openai/                  OpenAI Responses adapter
  tools/
    docker/                  Docker-isolated privileged subprocess tool
  reference/                 deterministic development and demonstration adapters
tests/                       cross-package architecture proof
evals/                       behavioral regression cases
```

The organization convention is:

- `apps/` contains executable composition roots and interfaces;
- `packages/` contains host-owned mechanisms and provider-neutral shared contracts;
- `plugins/` contains replaceable first-party behavior, grouped by capability;
- mythological names identify concrete implementations such as Athena, not umbrella architectural domains;
- each leaf package must have an exercised contract or an independent release reason;
- directory placement does not confer trust—validated manifests and the host loader remain authoritative.

`@olympus/contracts` owns the capability types and service keys so provider and tool plugins do not depend on Athena. Athena re-exports those contracts for v0 compatibility, but new code imports them from `@olympus/contracts`. See [ADR 0009](adr/0009-repository-package-taxonomy.md).

## Plugin admission

Each plugin declares an alpha-versioned manifest with identity, semantic version, trust mode, capability names, and a JSON Schema for non-secret configuration. Olympus validates the complete plugin set before dependency resolution or setup, then checks manifest capability names against the typed runtime keys. Invalid configuration, malformed or duplicate manifests, mismatched declarations, and unsupported isolated loading fail closed before any setup runs. See [ADR 0007](adr/0007-validated-plugin-manifests.md).

Oracle responses normalize text, function calls, opaque continuation, usage, request identity, streaming deltas, cancellation, and errors without exposing provider SDK types. The OpenAI adapter requests `OPENAI_API_KEY` from the host credential broker, uses `store: false`, and keeps function-call continuation state local. Deterministic fake transports cover the provider contract in CI. See [ADR 0006](adr/0006-credentials-and-model-provider-boundary.md).

## Capability and lifecycle contract

Each plugin declares stable capability keys it requires and provides. V0 uses exactly one provider per capability.

Before setup, Olympus rejects:

- missing providers;
- duplicate providers;
- duplicate plugin names;
- dependency cycles.

Setup follows dependency order. If setup fails, the failed plugin and every plugin activated by that composition attempt are disposed in reverse dependency order. Cleanup continues after disposal errors, while the original setup error remains the cause. Normal shutdown also disposes exactly once in reverse order.

Dynamic unloading, hot replacement, version negotiation, multiple-provider selection, and concurrent composition are explicitly deferred.

## Effects and safety

A tool implementation registers an effect handler with the host broker. Athena can invoke tools only through the ToolCatalog and broker. The host records request, authorization, start, and outcome events.

V0 supports repository-confined listing and UTF-8 file reads capped at 64 KiB. Direct host shell commands, writes, model-requested network calls, and destructive actions remain disabled.

The optional shell tool requires an explicit host-issued, effect-and-actor-scoped, expiring, single-use approval. It executes argv only through Docker with a digest-pinned local image, no network, a read-only workspace mount, an unprivileged user, bounded resources/output/time, and cancellation cleanup. Authorization is committed before execution and an outcome afterward; Docker unavailability fails setup closed. See [ADR 0008](adr/0008-docker-isolated-subprocess-effects.md).

## Thread semantics

A Thread is an append-only event record for inspection and audit. V0 guarantees:

- a versioned event envelope;
- unique event IDs;
- monotonic per-thread sequence numbers;
- actor and correlation metadata;
- redaction of obvious credential fields;
- explicit effect request, decision, attempt, and outcome events.

In v0, **replay** means reducing or rendering recorded events. It does not re-call models or repeat effects. **Rewind** will mean branching from an immutable checkpoint, never deleting history. Deterministic re-execution, compaction, and branch execution are future contracts.

Threads can remain in memory for disposable sessions or use the durable SQLite implementation. SQLite appends allocate the sequence and write the event in one transaction, apply versioned migrations, redact payloads before persistence, and support fail-closed idempotency keys. The CLI persists runs by default and exposes list, inspection, and render-only replay commands; none of those read paths invoke Athena, models, tools, or effects. See [ADR 0005](adr/0005-durable-sqlite-threads.md).

## Architecture proof

The vertical slice must continue to prove that:

1. two implementations of the Oracle capability swap through composition without Athena changes;
2. two implementations of the tool capability swap behind the host broker;
3. normalized semantic event types remain stable across swaps;
4. setup fault injection leaves no capability or handler active;
5. later clean activation and shutdown remain safe;
6. durable Thread events survive reopen without sequence gaps after a failed append.

See [the ADRs](adr/) for decisions and [the roadmap](roadmap.md) for planned work.
