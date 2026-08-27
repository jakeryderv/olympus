# ADR 0001: Trust and enforcement boundary

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The original design described Aegis security as an ordinary replaceable plugin while allowing arbitrary npm plugins to run in the same Node.js process. Such plugins can call operating-system APIs directly and bypass a peer plugin.

## Decision

In v0, all in-process plugins are trusted code and model-originated effect requests are untrusted. Olympus owns plugin admission, capability routing, lifecycle, the effect broker, final authorization enforcement, and authoritative audit emission. Replaceable policy and effect implementations run behind that boundary.

Untrusted plugins require a future out-of-process protocol and isolation boundary.

## Alternatives

- Treat Aegis as an ordinary peer plugin: rejected because it is bypassable.
- Isolate every plugin immediately: deferred because it would obscure the first architecture proof.

## Consequences

“Everything is a plugin” is narrowed to replaceable agent behavior. The host remains small but intentionally privileged. Package installation is explicitly a supply-chain trust decision.
