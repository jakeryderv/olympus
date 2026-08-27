# ADR 0009: Repository package taxonomy and neutral capability contracts

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The v0 architecture proof placed `core`, `athena`, `openai`, `docker`, and `reference` beside one another under `packages/`. Those names describe different axes: architectural role, mythological implementation, vendor, execution backend, and development purpose. The flat layout no longer communicates which code is host-owned and which code is replaceable behavior.

Oracle, ToolCatalog, and AgentRunner contracts also lived in `@olympus/athena`. Provider and tool plugins therefore depended on the default agent implementation even though those contracts are provider-neutral.

A proposed package-per-god taxonomy would group broad domains under Zeus, Hermes, Hephaestus, Mnemosyne, Themis, Argus, and Prometheus. That taxonomy would pre-create speculative boundaries and could incorrectly suggest that final policy enforcement is replaceable rather than kernel-owned.

## Decision

Use technical repository categories with mythology reserved for concrete implementations:

- `apps/` contains executable composition roots and interfaces;
- `packages/` contains host-owned mechanisms and neutral shared contracts;
- `plugins/` contains replaceable first-party behavior grouped by capability;
- leaf directories are package and release units;
- mythological names may identify implementations such as Athena but not umbrella domains;
- new categories and packages require an exercised contract or independent release reason.

The initial layout is:

```text
apps/cli
packages/core
packages/contracts
plugins/agents/athena
plugins/providers/openai
plugins/tools/docker
plugins/reference
```

`@olympus/contracts` owns the Oracle, ToolCatalog, and AgentRunner types, errors, and service keys. Athena, providers, tools, and composition roots depend on this neutral package. `@olympus/athena` temporarily re-exports the contracts to preserve its v0 public surface.

Filesystem placement is organizational metadata, not a trust decision. Every plugin still declares its trust mode in a validated manifest, and the host loader remains authoritative.

## Alternatives

- Keep the flat mixed layout: rejected because package role is not self-evident as the workspace grows.
- Use mythology for every architectural domain: rejected because the metaphor would determine boundaries, duplicate technical categories, and obscure the kernel enforcement rule.
- Put all provider or tool implementations into domain umbrella packages: rejected because independently replaceable implementations should remain independently testable and releasable.

## Consequences

Provider and tool plugins no longer depend on Athena. The repository layout now exposes the host-versus-plugin boundary while retaining concise package names such as `@olympus/openai`.

Workspace and test discovery must include nested `plugins/` directories. Future first-party implementations follow `plugins/<capability>/<implementation>`. Cross-capability reference fixtures may remain in `plugins/reference` as a deliberate development bundle until independent contracts or release needs justify splitting them.
