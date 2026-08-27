# @olympus/cli

## 0.1.2

### Patch Changes

- 81e5e86: Add fail-closed checkpoint-anchored Thread retention planning with protected-artifact verification and a non-mutating CLI dry-run.
- Updated dependencies [81e5e86]
  - @olympus/core@0.1.2
  - @olympus/contracts@0.1.2
  - @olympus/athena@0.1.2
  - @olympus/openai@0.1.2
  - @olympus/reference@0.1.2
  - @olympus/docker@0.1.2

## 0.1.1

### Patch Changes

- 463a77e: Organize replaceable implementations under capability-based plugin directories and move shared Oracle, ToolCatalog, and AgentRunner APIs into the neutral `@olympus/contracts` package.
- 6838fe8: Add immutable Thread checkpoints, offline-verifiable protected artifacts, and CLI commands for checkpointing, verification, and export.
- Updated dependencies [463a77e]
- Updated dependencies [6838fe8]
  - @olympus/athena@0.1.1
  - @olympus/docker@0.1.1
  - @olympus/openai@0.1.1
  - @olympus/reference@0.1.1
  - @olympus/core@0.1.1
  - @olympus/contracts@0.1.1

## 0.1.0

### Minor Changes

- ae2028a: Add scoped single-use approvals and Docker-only guarded subprocess tools with fail-closed availability checks, confinement, cancellation, timeout, and output limits.
- 87360d7: Add provider-neutral Oracle streaming, cancellation, metadata, and error contracts plus an OpenAI Responses adapter backed by a host-owned credential broker.
- 65744b1: Persist CLI runs to SQLite by default and add list, show, and render-only replay commands for Thread inspection.

### Patch Changes

- Updated dependencies [ae2028a]
- Updated dependencies [b47e918]
- Updated dependencies [87360d7]
- Updated dependencies [65744b1]
- Updated dependencies [bc15054]
  - @olympus/athena@0.1.0
  - @olympus/core@0.1.0
  - @olympus/docker@0.1.0
  - @olympus/openai@0.1.0
  - @olympus/reference@0.1.0
