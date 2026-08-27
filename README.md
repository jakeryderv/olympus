# Olympus

> A plugin-first AI agent harness. Build your own pantheon.

Olympus is an experimental TypeScript harness that keeps agent behavior replaceable while reserving composition and trust enforcement for a small host kernel. The current repository implements a safe, deterministic, read-only vertical slice—not a production coding agent.

## Status

The v0 architecture proof currently provides:

- typed capability registration and dependency resolution;
- plugin setup rollback and reverse-order disposal;
- replaceable model and tool-capability implementations;
- a host-owned, default-deny effect broker;
- confined read-only repository tools;
- append-only, redacted in-memory Thread events;
- a minimal Athena orchestration loop and CLI;
- conventional tests and behavioral regression evals.

Shell commands, file writes, network effects, third-party plugin isolation, deterministic replay, and hot unloading are deliberately out of scope.

## Requirements

- Node.js 22.14.0 (see `.node-version`)
- pnpm 10.33.0 through Corepack
- [just](https://github.com/casey/just)

## Setup

```bash
git clone https://github.com/jakeryderv/olympus.git
cd olympus
just setup
just check
```

## Usage

Run the deterministic inspection adapter with repository-backed read tools:

```bash
just run --model inspection --tools repository list
just run --model inspection --tools repository "read README.md"
```

Inspect the complete event Thread:

```bash
just run --model inspection --tools fake --json list
```

Swap adapters without changing Athena:

```bash
just run --model echo --tools fake "hello olympus"
just run --model uppercase --tools fake "hello olympus"
```

## Project commands

```bash
just setup   # install the pinned workspace
just test    # conventional tests
just eval    # behavioral regression cases
just build   # compile all workspace packages
just check   # formatting, lint, types, build, tests, and evals
```

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/adr/)
- [Versioning policy](docs/versioning.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

Apache-2.0. See [LICENSE](LICENSE).
