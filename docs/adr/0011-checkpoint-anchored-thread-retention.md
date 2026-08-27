# ADR 0011: Checkpoint-anchored Thread retention planning

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

ADR 0010 introduced immutable checkpoints and protected artifacts but deliberately deferred retention. Removing an event prefix changes what remains available in the live SQLite Thread and can break assumptions that checkpoints are recomputed from sequence 1. A destructive implementation without an inspectable policy would weaken the fail-closed audit boundary.

Retention also needs stronger evidence than the existence of a checkpoint. A checkpoint proves the recorded prefix, while a protected artifact proves that the exact redacted prefix has been published outside the live database. The first retention slice should exercise those preconditions without deleting data.

## Decision

Olympus first implements a read-only retention planner. Planning is an explicit user-originated CLI operation and never runs from a model, plugin, timer, or implicit age/count policy. The planner does not mutate events, checkpoints, Thread heads, artifacts, or schema state.

A plan is eligible only when all of the following hold:

- the live Thread exists and its events remain contiguous from sequence 1;
- the proposed boundary is an immutable checkpoint persisted for that Thread;
- the checkpoint verifies against the corresponding live event prefix;
- a protected artifact verifies against the same checkpoint and event prefix;
- on platforms with Unix permission bits, the artifact grants no group or other access;
- at least one later event remains in the live Thread, so this slice cannot archive an entire Thread.

A valid plan identifies exact removable and retained ranges, including sequence boundaries, event IDs, and counts. The removable range always begins at sequence 1 and ends at the artifact checkpoint. The retained range begins at the next sequence. Equivalent inputs produce the same plan.

The CLI command is:

```text
thread retention-plan <thread-id> --artifact <path> [--db <path>] [--json]
```

Human output must say `dry-run` and state that no events were deleted. JSON output includes a versioned plan and the resolved artifact path.

Actual compaction remains deferred. A later ADR and implementation must persist a retention anchor containing the removed prefix checkpoint, teach verification to continue the digest chain from that anchor, preserve monotonic sequence allocation, define crash recovery, and require an explicit destructive confirmation. Full-Thread archival and checkpoint/artifact garbage collection remain separate policies.

## Alternatives

- Delete immediately after export: rejected because export success alone does not define live-history continuity or recovery.
- Use only an artifact without a persisted checkpoint: rejected because the live database would have no immutable record of the accepted boundary.
- Plan by age or event count: rejected because those selectors do not prove protected preservation and can bisect meaningful audit history.
- Permit removal through the latest event: rejected in this slice because an empty live Thread needs separate archival semantics.
- Store plans in the event stream: rejected because a dry-run is not an audit fact and would mutate the Thread being inspected.

## Consequences

Operators can inspect exact retention effects before Olympus gains deletion capability. Planner tests become executable policy for the later compactor. Protected artifact permissions become a retention precondition, not merely an export default. SQLite adds a checkpoint lookup API but no migration or destructive statement. The initial planner cannot reclaim space by itself and intentionally rejects full archival.
