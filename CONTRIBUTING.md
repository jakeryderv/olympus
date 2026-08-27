# Contributing

Thank you for helping improve Olympus.

For development requirements and setup, use the canonical instructions in the [README](README.md#setup).

## Workflow

1. Open or select an issue with clear acceptance criteria.
2. Create a short-lived branch such as `feat/plugin-loader` or `fix/lifecycle-rollback`.
3. Make a focused change and add or update tests and evals.
4. Run `just check`.
5. Open a pull request linked to the issue.

Use Conventional Commits such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`. Keep public contract changes explicit and add a Changeset when they affect released behavior.

## Architecture changes

Read [the architecture](docs/architecture.md) and existing [ADRs](docs/adr/) first. Add an ADR when a consequential design choice is disputed or changes a trust, lifecycle, event, or public-contract boundary. ADRs are append-only; supersede rather than rewrite accepted history.

## Definition of done

- acceptance criteria are satisfied;
- tests or evals cover changed behavior;
- formatting, linting, types, build, tests, and evals pass through `just check`;
- documentation and security implications are updated;
- CI and review are complete.
