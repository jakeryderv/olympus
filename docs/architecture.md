# Olympus Architecture

## Purpose

Olympus is a plugin-first AI agent harness. It provides a small host runtime that composes a Pantheon of replaceable agent behaviors.

The governing rule is:

> **All agent behavior is replaceable; composition and trust enforcement are kernel responsibilities.**

This replaces the overly broad claim that literally everything is a plugin. A replaceable peer plugin cannot be the non-bypassable security boundary for other in-process code.

## Trust model

The v0 model is intentionally narrow:

- in-process plugin code is trusted application code;
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

The implementation is split only where a contract is exercised:

```text
packages/core       host kernel, lifecycle, effect broker, Thread
packages/athena     default orchestration capability
packages/reference  deterministic model and read-tool adapters
packages/openai     OpenAI Responses adapter
apps/cli            composition root and user interface
tests               cross-package architecture proof
evals               behavioral regression cases
```

New mythological packages are added only after a boundary has an independently testable contract or release reason.

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

V0 supports repository-confined listing and UTF-8 file reads capped at 64 KiB. It does not support shell commands, writes, network calls, credentials, or destructive actions.

A future guarded-shell slice must add explicit per-invocation approval, a sanitized environment and working directory, timeout and cancellation, bounded output, process isolation, and durable audit records before execution is enabled.

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
