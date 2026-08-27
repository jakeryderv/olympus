import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, link, mkdir, open, readFile, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { serializeAuditValue, type SafeAuditValue, type ThreadEvent } from "./thread.js";

const CHECKPOINT_DOMAIN = "olympus.thread-checkpoint/v1";
const ARTIFACT_FORMAT = "olympus.thread-artifact";
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface ThreadCheckpoint {
  readonly schemaVersion: 1;
  readonly algorithm: "sha256";
  readonly threadId: string;
  readonly eventCount: number;
  readonly throughSequence: number;
  readonly throughEventId: string;
  readonly digest: string;
}

export interface PersistedThreadCheckpoint extends ThreadCheckpoint {
  readonly createdAt: string;
}

export interface ThreadArtifact {
  readonly format: typeof ARTIFACT_FORMAT;
  readonly schemaVersion: 1;
  readonly checkpoint: PersistedThreadCheckpoint;
  readonly events: readonly ThreadEvent[];
}

declare const protectedArtifactBrand: unique symbol;

export type ProtectedThreadArtifact = ThreadArtifact & {
  readonly [protectedArtifactBrand]: true;
};

function eventValue(event: ThreadEvent): { [key: string]: SafeAuditValue } {
  const value: { [key: string]: SafeAuditValue } = {
    actor: event.actor,
    correlationId: event.correlationId,
    eventId: event.eventId,
    payload: event.payload as SafeAuditValue,
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    threadId: event.threadId,
    timestamp: event.timestamp,
    type: event.type,
  };
  if (event.causationId !== undefined) {
    value.causationId = event.causationId;
  }
  return value;
}

function canonicalEvent(event: ThreadEvent): string {
  return serializeAuditValue(eventValue(event));
}

function initialDigest(threadId: string): Buffer {
  return createHash("sha256").update(CHECKPOINT_DOMAIN).update("\0").update(threadId).digest();
}

function nextDigest(previous: Buffer, event: ThreadEvent): Buffer {
  return createHash("sha256")
    .update(CHECKPOINT_DOMAIN)
    .update("\0")
    .update(previous)
    .update("\0")
    .update(canonicalEvent(event))
    .digest();
}

export function createThreadCheckpoint(events: readonly ThreadEvent[]): ThreadCheckpoint {
  const first = events[0];
  if (first === undefined) {
    throw new Error("Cannot checkpoint an empty Thread.");
  }
  let digest = initialDigest(first.threadId);
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.threadId !== first.threadId) {
      throw new Error("Checkpoint events must belong to one Thread.");
    }
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Checkpoint events must be contiguous from sequence 1; expected ${expectedSequence}.`,
      );
    }
    if (event.schemaVersion !== 1) {
      throw new Error(`Unsupported Thread event schema version: ${event.schemaVersion}.`);
    }
    digest = nextDigest(digest, event);
  }
  const terminal = events.at(-1);
  if (terminal === undefined) {
    throw new Error("Cannot checkpoint an empty Thread.");
  }
  return {
    schemaVersion: 1,
    algorithm: "sha256",
    threadId: first.threadId,
    eventCount: events.length,
    throughSequence: terminal.sequence,
    throughEventId: terminal.eventId,
    digest: digest.toString("hex"),
  };
}

export function createAnchoredThreadCheckpoint(
  events: readonly ThreadEvent[],
  anchor: ThreadCheckpoint,
): ThreadCheckpoint {
  const first = events[0];
  if (first === undefined) {
    throw new Error("Cannot checkpoint an empty retained suffix.");
  }
  if (
    anchor.schemaVersion !== 1 ||
    anchor.algorithm !== "sha256" ||
    !SHA256_HEX.test(anchor.digest) ||
    anchor.eventCount !== anchor.throughSequence
  ) {
    throw new Error("Retention anchor has an invalid checkpoint shape.");
  }
  let digest: Buffer<ArrayBufferLike> = Buffer.from(anchor.digest, "hex");
  for (const [index, event] of events.entries()) {
    const expectedSequence = anchor.throughSequence + index + 1;
    if (event.threadId !== anchor.threadId) {
      throw new Error("Anchored checkpoint events must belong to the anchor Thread.");
    }
    if (event.sequence !== expectedSequence) {
      throw new Error(`Anchored checkpoint events must continue at sequence ${expectedSequence}.`);
    }
    if (event.schemaVersion !== 1) {
      throw new Error(`Unsupported Thread event schema version: ${event.schemaVersion}.`);
    }
    digest = nextDigest(digest, event);
  }
  const terminal = events.at(-1);
  if (terminal === undefined) {
    throw new Error("Cannot checkpoint an empty retained suffix.");
  }
  return {
    schemaVersion: 1,
    algorithm: "sha256",
    threadId: anchor.threadId,
    eventCount: anchor.eventCount + events.length,
    throughSequence: terminal.sequence,
    throughEventId: terminal.eventId,
    digest: digest.toString("hex"),
  };
}

function sameDigest(left: string, right: string): boolean {
  if (!SHA256_HEX.test(left) || !SHA256_HEX.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function sameCheckpoint(left: ThreadCheckpoint, right: ThreadCheckpoint): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.algorithm === right.algorithm &&
    left.threadId === right.threadId &&
    left.eventCount === right.eventCount &&
    left.throughSequence === right.throughSequence &&
    left.throughEventId === right.throughEventId &&
    sameDigest(left.digest, right.digest)
  );
}

export function verifyThreadCheckpoint(
  events: readonly ThreadEvent[],
  checkpoint: ThreadCheckpoint,
): boolean {
  try {
    return sameCheckpoint(createThreadCheckpoint(events), checkpoint);
  } catch {
    return false;
  }
}

export function verifyAnchoredThreadCheckpoint(
  events: readonly ThreadEvent[],
  anchor: ThreadCheckpoint,
  checkpoint: ThreadCheckpoint,
): boolean {
  try {
    return sameCheckpoint(createAnchoredThreadCheckpoint(events, anchor), checkpoint);
  } catch {
    return false;
  }
}

export function createThreadArtifact(
  events: readonly ThreadEvent[],
  checkpoint: PersistedThreadCheckpoint,
): ThreadArtifact {
  if (!verifyThreadCheckpoint(events, checkpoint)) {
    throw new Error("Thread events do not match the checkpoint.");
  }
  return {
    format: ARTIFACT_FORMAT,
    schemaVersion: 1,
    checkpoint: structuredClone(checkpoint),
    events: structuredClone(events),
  };
}

export function serializeThreadArtifact(artifact: ThreadArtifact): string {
  if (!verifyThreadCheckpoint(artifact.events, artifact.checkpoint)) {
    throw new Error("Thread artifact failed checkpoint verification.");
  }
  const checkpoint = artifact.checkpoint;
  const value: SafeAuditValue = {
    format: artifact.format,
    schemaVersion: artifact.schemaVersion,
    checkpoint: {
      algorithm: checkpoint.algorithm,
      createdAt: checkpoint.createdAt,
      digest: checkpoint.digest,
      eventCount: checkpoint.eventCount,
      schemaVersion: checkpoint.schemaVersion,
      threadId: checkpoint.threadId,
      throughEventId: checkpoint.throughEventId,
      throughSequence: checkpoint.throughSequence,
    },
    events: artifact.events.map(eventValue),
  };
  return `${serializeAuditValue(value)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isThreadEvent(value: unknown): value is ThreadEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.threadId === "string" &&
    typeof value.eventId === "string" &&
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    typeof value.type === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.actor === "string" &&
    typeof value.correlationId === "string" &&
    (value.causationId === undefined || typeof value.causationId === "string") &&
    value.schemaVersion === 1 &&
    "payload" in value
  );
}

function isPersistedCheckpoint(value: unknown): value is PersistedThreadCheckpoint {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    value.algorithm === "sha256" &&
    typeof value.threadId === "string" &&
    Number.isSafeInteger(value.eventCount) &&
    (value.eventCount as number) > 0 &&
    Number.isSafeInteger(value.throughSequence) &&
    (value.throughSequence as number) > 0 &&
    typeof value.throughEventId === "string" &&
    typeof value.digest === "string" &&
    SHA256_HEX.test(value.digest) &&
    typeof value.createdAt === "string"
  );
}

export function parseThreadArtifact(text: string): ThreadArtifact {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("Thread artifact is not valid JSON.", { cause: error });
  }
  if (
    !isRecord(value) ||
    value.format !== ARTIFACT_FORMAT ||
    value.schemaVersion !== 1 ||
    !isPersistedCheckpoint(value.checkpoint) ||
    !Array.isArray(value.events) ||
    !value.events.every(isThreadEvent)
  ) {
    throw new Error("Thread artifact has an invalid schema.");
  }
  const artifact: ThreadArtifact = {
    format: ARTIFACT_FORMAT,
    schemaVersion: 1,
    checkpoint: value.checkpoint,
    events: value.events,
  };
  if (!verifyThreadCheckpoint(artifact.events, artifact.checkpoint)) {
    throw new Error("Thread artifact failed checkpoint verification.");
  }
  return artifact;
}

export async function readThreadArtifact(path: string): Promise<ThreadArtifact> {
  return parseThreadArtifact(await readFile(path, "utf8"));
}

export async function readProtectedThreadArtifact(path: string): Promise<ProtectedThreadArtifact> {
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new Error(`Protected Thread artifact is not a regular file: ${path}`);
    }
    if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
      throw new Error(`Protected Thread artifact permissions are too broad: ${path}`);
    }
    return parseThreadArtifact(await handle.readFile("utf8")) as ProtectedThreadArtifact;
  } finally {
    await handle.close();
  }
}

export async function writeThreadArtifact(path: string, artifact: ThreadArtifact): Promise<string> {
  const destination = resolve(path);
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${basename(destination)}.${randomUUID()}.tmp`);
  const bytes = serializeThreadArtifact(artifact);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, destination);
    await chmod(destination, 0o600);
    return destination;
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") {
      throw new Error(`Thread artifact already exists: ${destination}`, { cause: error });
    }
    throw error;
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        // Preserve the primary write or publication error.
      }
    }
    try {
      await unlink(temporary);
    } catch {
      // The temporary link may already have been removed.
    }
  }
}
