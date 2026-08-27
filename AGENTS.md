# Agent Guidance

Olympus is a TypeScript/pnpm monorepo for a plugin-first AI agent harness.

## Start here

- Setup and commands: [README.md](README.md)
- Architecture and boundaries: [docs/architecture.md](docs/architecture.md)
- Accepted decisions: [docs/adr/](docs/adr/)
- Current priorities: [docs/roadmap.md](docs/roadmap.md)
- Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)

## Commands

Use the repository interface rather than invoking underlying tools directly:

- `just test`
- `just eval`
- `just build`
- `just check`

## Repository organization

- `apps/` contains executable composition roots and interfaces.
- `packages/` contains host-owned mechanisms and neutral shared contracts.
- `plugins/` contains replaceable first-party behavior grouped by capability.
- Import Oracle, ToolCatalog, and AgentRunner APIs from `@olympus/contracts`; do not make plugins depend on Athena for neutral contracts.
- Use mythological names for concrete implementations, not umbrella architectural domains.

## Constraints

- Keep composition and trust enforcement in `packages/core`.
- Treat in-process plugins as trusted and model-originated effects as untrusted.
- Route every model-requested effect through the host broker.
- Do not add shell, write, network, or credential effects without a new approved ADR and complete enforcement controls.
- Preserve reverse-order rollback and disposal semantics.
- Keep Thread events append-only and avoid storing secrets.
- Add packages only for exercised contracts or independent release needs.
- Do not introduce multi-agent behavior before the single-agent contracts stabilize.

Update tests and behavioral evals for every fixed regression. Run `just check` before declaring work complete.
