# Olympus

> A plugin-first AI agent harness. Build your own pantheon.

Olympus is an experimental TypeScript harness that keeps agent behavior replaceable while reserving composition and trust enforcement for a small host kernel. The current repository implements a safe, deterministic, read-only vertical slice—not a production coding agent.

## Status

The completed v0.1 local-harness milestone provides:

- validated plugin manifests, explicit trust modes, and typed capability resolution;
- plugin setup rollback and reverse-order disposal;
- replaceable model and tool-capability implementations, including OpenAI Responses;
- a host-owned, default-deny effect broker;
- confined read-only repository tools;
- append-only, redacted in-memory and durable SQLite Thread events;
- a minimal Athena orchestration loop and CLI;
- conventional tests and behavioral regression evals.

Direct host shell commands, file writes, model-requested network effects, third-party plugin isolation, deterministic replay, and hot unloading are deliberately out of scope. Privileged argv execution is available only through the guarded Docker tool.

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

Runs persist their audit Thread to `.olympus/threads.sqlite` by default and print the Thread ID. Inspect or render it without re-executing models or effects:

```bash
just run thread list
just run thread show <thread-id>
just run thread replay <thread-id> --json
```

Use another database with `--db path/to/threads.sqlite`, or disable persistence for a disposable run with `--ephemeral`. JSON run output includes the complete event Thread:

```bash
just run --model inspection --tools fake --json list
```

Swap deterministic adapters without changing Athena:

```bash
just run --model echo --tools fake "hello olympus"
just run --model uppercase --tools fake "hello olympus"
```

Use the real OpenAI Responses adapter by supplying the credential through the process environment, never through CLI arguments or committed configuration:

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.6" # optional; --openai-model overrides it
just run --model openai --tools repository "Summarize README.md"
```

Run one explicitly approved command through the Docker-only shell tool. The image must already exist locally and be pinned by digest; the repository is mounted read-only and networking is disabled:

```bash
just run --model openai --tools docker --allow-shell \
  --docker-image 'example/image@sha256:<64-hex-digest>' \
  "Run the project tests"
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
