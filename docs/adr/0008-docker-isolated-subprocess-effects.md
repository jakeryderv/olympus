# ADR 0008: Docker-isolated subprocess effects

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

Shell execution is a privileged, model-originated effect. Running a command directly on the host—even after a policy callback—would expose credentials, writable files, processes, and the network. Authorization also has to be durably recorded before execution, not inferred afterward.

## Decision

Olympus supports one guarded subprocess path: argv execution in Docker. It never passes model text through a host shell. The Docker daemon must be reachable during plugin setup or composition fails closed.

The host issues opaque, scoped, expiring, single-use approval tokens. A token is bound to an effect and actor; invalid, expired, replayed, or out-of-scope tokens are denied. The default `ReadOnlyPolicy` still denies every privileged effect. The CLI issues one shell approval only when the user explicitly passes `--allow-shell`; the token is injected by trusted host composition and is not exposed to the model.

Before the Docker handler starts, the host appends committed `effect.requested`, `effect.authorized`, and `effect.started` events. Completion or failure is appended afterward. If durable authorization recording fails, execution never begins.

Docker execution requires a sha256-pinned image already present locally (`--pull never`) and applies:

- no network, all capabilities dropped, no-new-privileges, a read-only root filesystem, and an unprivileged user;
- bounded PIDs, memory, CPU, timeout, and stdout/stderr;
- a single read-only bind mount at `/workspace`, with no Docker socket;
- a bounded no-exec tmpfs and no host environment forwarding;
- a workspace-relative cwd with traversal and absolute paths rejected.

Cancellation kills the Docker client process and force-removes the named container. Replay remains render-only and never re-executes the effect.

## Alternatives

- Direct `child_process` shell execution: rejected because policy is not process isolation.
- Firejail, bubblewrap, or platform-specific sandboxes: deferred to avoid inconsistent guarantees.
- Automatically pull mutable image tags: rejected for reproducibility and supply-chain safety.
- Long-lived reusable approvals: rejected because replay and confused-deputy risk increase sharply.

## Consequences

Docker is an explicit runtime prerequisite for shell tools. The initial workspace mount is read-only, so shell tools can inspect and compute but cannot modify the repository. A future writable workflow requires a separate design for artifact export and approval scope.
