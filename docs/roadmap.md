# Roadmap

## Why Olympus exists

Agent harnesses often couple model providers, tools, memory, interfaces, and orchestration into one implementation. Olympus explores whether these behaviors can be composed behind explicit contracts while keeping trust enforcement small and non-bypassable.

## Now — v0.1 useful local harness

The v0.1 milestone is complete:

- durable, atomic SQLite Threads with inspection and render-only replay;
- a provider-neutral Oracle contract and OpenAI Responses adapter;
- validated plugin manifests with explicit trust classification;
- host-owned credential and effect boundaries;
- scoped single-use approvals and Docker-isolated subprocess effects;
- CI, security automation, behavioral evals, ADRs, and Changesets.

The immediate priority is maintaining these contracts and preserving the fail-closed defaults.

## Next — operational depth

- Implement transactional checkpoint-anchored compaction for durable Threads; the retention policy and read-only dry-run planner are implemented.
- Design explicitly approved writable workspaces without weakening the read-only Docker mount.
- Define the isolated third-party plugin wire protocol and process supervisor.
- Improve CLI diagnostics, structured streaming output, and approval UX.
- Add additional real providers only through the normalized Oracle contract.

## Later — ecosystem

- Memory, policy, sandbox-backend, and observability plugins.
- TUI and headless interfaces.
- Alternative isolation backends with equivalent, tested guarantees.
- Multi-agent Heroes and Expeditions only after the single-agent contracts stabilize.

Hot reload, deterministic effect replay, a plugin marketplace, remote runtimes, and multi-agent communication are intentionally not committed milestones.
