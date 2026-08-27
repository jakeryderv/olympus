# Roadmap

## Why Olympus exists

Agent harnesses often couple model providers, tools, memory, interfaces, and orchestration into one implementation. Olympus explores whether these behaviors can be composed behind explicit contracts while keeping trust enforcement small and non-bypassable.

## Now — architecture proof

- Maintain the safe read-only vertical slice.
- Keep lifecycle, substitution, confinement, and audit tests green.
- Establish project automation, contribution guidance, and behavioral evals.
- Validate the plugin contract before adding more packages.

## Next — useful local harness

- Add one real model provider behind the Oracle contract.
- Add durable, atomic Thread persistence with migrations and retention rules.
- Design approval tokens and a guarded subprocess broker.
- Define plugin manifests, configuration validation, and trust classification.
- Improve CLI diagnostics and event inspection.

## Later — ecosystem

- Isolated third-party plugin processes and a versioned wire protocol.
- Guarded shell and file-write effects.
- Memory, policy, sandbox, and observability plugins.
- TUI and headless interfaces.
- Multi-agent Heroes and Expeditions only after the single-agent contracts stabilize.

Hot reload, deterministic effect replay, a plugin marketplace, remote runtimes, and multi-agent communication are intentionally not committed milestones.
