import {
  createThreadCheckpoint,
  type PersistedThreadCheckpoint,
  type ThreadArtifact,
  verifyThreadCheckpoint,
} from "./thread-artifact.js";
import type { ThreadEvent } from "./thread.js";

export interface ThreadRetentionRange {
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly firstEventId: string;
  readonly lastEventId: string;
  readonly eventCount: number;
}

export interface ThreadRetentionPlan {
  readonly schemaVersion: 1;
  readonly mode: "dry-run";
  readonly threadId: string;
  readonly boundary: PersistedThreadCheckpoint;
  readonly removable: ThreadRetentionRange;
  readonly retained: ThreadRetentionRange;
}

function sameCheckpoint(
  left: PersistedThreadCheckpoint,
  right: PersistedThreadCheckpoint,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.algorithm === right.algorithm &&
    left.threadId === right.threadId &&
    left.eventCount === right.eventCount &&
    left.throughSequence === right.throughSequence &&
    left.throughEventId === right.throughEventId &&
    left.digest === right.digest &&
    left.createdAt === right.createdAt
  );
}

function eventRange(events: readonly ThreadEvent[]): ThreadRetentionRange {
  const first = events[0];
  const last = events.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("Retention ranges cannot be empty.");
  }
  return {
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    firstEventId: first.eventId,
    lastEventId: last.eventId,
    eventCount: events.length,
  };
}

export function planThreadRetention(
  events: readonly ThreadEvent[],
  checkpoint: PersistedThreadCheckpoint,
  artifact: ThreadArtifact,
): ThreadRetentionPlan {
  createThreadCheckpoint(events);
  if (!sameCheckpoint(checkpoint, artifact.checkpoint)) {
    throw new Error("Protected artifact does not match the persisted checkpoint.");
  }
  if (!verifyThreadCheckpoint(artifact.events, artifact.checkpoint)) {
    throw new Error("Protected artifact failed checkpoint verification.");
  }
  const removableEvents = events.slice(0, checkpoint.eventCount);
  if (!verifyThreadCheckpoint(removableEvents, checkpoint)) {
    throw new Error("Persisted checkpoint does not match the live Thread prefix.");
  }
  const retainedEvents = events.slice(checkpoint.eventCount);
  if (retainedEvents.length === 0) {
    throw new Error(
      "Retention planning requires at least one event after the checkpoint boundary.",
    );
  }
  return {
    schemaVersion: 1,
    mode: "dry-run",
    threadId: checkpoint.threadId,
    boundary: structuredClone(checkpoint),
    removable: eventRange(removableEvents),
    retained: eventRange(retainedEvents),
  };
}
