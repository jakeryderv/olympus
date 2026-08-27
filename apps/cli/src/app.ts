import { resolve } from "node:path";
import { createAthenaPlugin } from "@olympus/athena";
import { AGENT_RUNNER } from "@olympus/contracts";
import { createDockerToolPlugin } from "@olympus/docker";
import { createOpenAIPlugin } from "@olympus/openai";
import * as CoreModule from "@olympus/core";
import {
  EFFECT_BROKER,
  HostEffectBroker,
  InMemoryThread,
  Olympus,
  ReadOnlyPolicy,
  hostService,
  type OlympusPlugin,
  type PolicyEvaluator,
  type ServiceKey,
  type ThreadEvent,
} from "@olympus/core";
import {
  createModelPlugin,
  createToolPlugin,
  type ModelVariant,
  type ToolVariant,
} from "@olympus/reference";
import { type CliCommand, parseCliCommand } from "./arguments.js";

interface ApprovalAuthorityLike {
  issue(scope: { readonly effect: string; readonly actor: string }): { readonly id: string };
}

interface CredentialBrokerLike {
  get(name: string): { reveal(): string };
}

type PersistedThreadCheckpoint =
  import("../../../packages/core/dist/thread-artifact.js").PersistedThreadCheckpoint;
type DeclaredSqliteThread = InstanceType<typeof CoreModule.SqliteThread>;
type CurrentSqliteThread = DeclaredSqliteThread & {
  checkpointAt(threadId: string, throughSequence: number): PersistedThreadCheckpoint | undefined;
  createCheckpoint(threadId?: string): PersistedThreadCheckpoint;
  latestCheckpoint(threadId?: string): PersistedThreadCheckpoint | undefined;
  verifyCheckpoint(checkpoint: PersistedThreadCheckpoint): boolean;
};
type CurrentThreadRuntime = {
  readonly SqliteThread: new (
    ...args: ConstructorParameters<typeof CoreModule.SqliteThread>
  ) => CurrentSqliteThread;
  readonly createThreadArtifact: typeof import("../../../packages/core/dist/thread-artifact.js").createThreadArtifact;
  readonly planThreadRetention: typeof import("../../../packages/core/dist/thread-retention.js").planThreadRetention;
  readonly readProtectedThreadArtifact: typeof import("../../../packages/core/dist/thread-artifact.js").readThreadArtifact;
  readonly readThreadArtifact: typeof import("../../../packages/core/dist/thread-artifact.js").readThreadArtifact;
  readonly writeThreadArtifact: typeof import("../../../packages/core/dist/thread-artifact.js").writeThreadArtifact;
};

// SAFETY: core exports these runtime APIs; the cast bridges stale workspace declarations while
// deriving every new Thread API from the built core declaration rather than duplicating contracts.
const CoreRuntime = CoreModule as unknown as {
  ApprovalAuthority: new () => ApprovalAuthorityLike;
  ApprovalPolicy: new (
    authority: ApprovalAuthorityLike,
    fallback: PolicyEvaluator,
  ) => PolicyEvaluator;
  CREDENTIAL_BROKER: ServiceKey<CredentialBrokerLike>;
  EnvironmentCredentialBroker: new (
    environment: Readonly<Record<string, string | undefined>>,
  ) => CredentialBrokerLike;
} & CurrentThreadRuntime;
const {
  ApprovalAuthority,
  ApprovalPolicy,
  CREDENTIAL_BROKER,
  createThreadArtifact,
  EnvironmentCredentialBroker,
  planThreadRetention,
  readProtectedThreadArtifact,
  readThreadArtifact,
  SqliteThread,
  writeThreadArtifact,
} = CoreRuntime;

export interface CliIo {
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

const helpText = `Olympus — plugin-first agent harness

Usage:
  olympus run [options] <objective>
  olympus [options] <objective>
  olympus thread list [--db path] [--json]
  olympus thread show <thread-id> [--db path] [--json]
  olympus thread replay <thread-id> [--db path] [--json]
  olympus thread checkpoint <thread-id> [--db path] [--json]
  olympus thread verify <thread-id> [--db path] [--json]
  olympus thread export <thread-id> --output <path> [--db path] [--json]
  olympus thread verify-artifact <path> [--json]
  olympus thread retention-plan <thread-id> --artifact <path> [--db path] [--json]

Run options:
  --model inspection|echo|uppercase|openai
  --openai-model model-id (or OPENAI_MODEL)
  --tools repository|fake|docker
  --docker-image name@sha256:digest (required for docker tools)
  --allow-shell (issues one scoped, single-use approval)
  --root path
  --db path
  --thread-id id
  --ephemeral
  --json
`;

function isReferenceModel(value: string): value is ModelVariant {
  return ["echo", "inspection", "uppercase"].includes(value);
}

function isToolVariant(value: string): value is ToolVariant {
  return ["fake", "repository"].includes(value);
}

function toolPlugin(
  command: Extract<CliCommand, { kind: "run" }>,
  approvalId?: string,
): OlympusPlugin {
  if (command.tools !== "docker") {
    if (!isToolVariant(command.tools)) {
      throw new Error(`Unknown tool variant: ${command.tools}`);
    }
    return createToolPlugin(command.tools, command.root);
  }
  if (command.dockerImage === undefined) {
    throw new Error("Docker tools require --docker-image with a sha256-pinned image.");
  }
  return createDockerToolPlugin({
    image: command.dockerImage,
    workspaceRoot: command.root,
    ...(approvalId === undefined ? {} : { approvalId }),
  });
}

function oraclePlugin(command: Extract<CliCommand, { kind: "run" }>, io: CliIo): OlympusPlugin {
  if (command.model === "openai") {
    return createOpenAIPlugin({
      model: command.openAIModel ?? io.environment.OPENAI_MODEL ?? "gpt-5.6",
    });
  }
  if (!isReferenceModel(command.model)) {
    throw new Error(`Unknown model variant: ${command.model}`);
  }
  return createModelPlugin(command.model);
}

function databasePath(cwd: string, filename: string): string {
  return resolve(cwd, filename);
}

function openThreadInspector(filename: string): CurrentSqliteThread {
  return new SqliteThread({ filename });
}

function renderEvent(event: ThreadEvent): string {
  const heading = `${String(event.sequence).padStart(4, "0")} ${event.timestamp} ${event.type} [${event.actor}]`;
  return `${heading}\n${JSON.stringify(event.payload, null, 2)}\n`;
}

async function handleThreadCommand(
  command: Exclude<CliCommand, { kind: "help" } | { kind: "run" }>,
  io: CliIo,
): Promise<void> {
  if (command.kind === "thread-verify-artifact") {
    const path = resolve(io.cwd, command.artifact);
    const artifact = await readThreadArtifact(path);
    if (command.json) {
      io.writeStdout(
        `${JSON.stringify({ path, valid: true, checkpoint: artifact.checkpoint }, null, 2)}\n`,
      );
    } else {
      io.writeStdout(
        `Verified artifact for Thread ${artifact.checkpoint.threadId} through sequence ${artifact.checkpoint.throughSequence}.\n`,
      );
    }
    return;
  }

  const filename = databasePath(io.cwd, command.database);
  const reader = openThreadInspector(filename);
  try {
    if (command.kind === "thread-list") {
      const threads = reader.listThreads();
      if (command.json) {
        io.writeStdout(`${JSON.stringify({ database: filename, threads }, null, 2)}\n`);
      } else if (threads.length === 0) {
        io.writeStdout("No persisted Threads.\n");
      } else {
        for (const thread of threads) {
          io.writeStdout(`${thread.id}\t${thread.eventCount} events\t${thread.createdAt}\n`);
        }
      }
      return;
    }

    const events = reader.readThread(command.threadId);
    if (events.length === 0) {
      throw new Error(`Thread not found: ${command.threadId}`);
    }
    if (command.kind === "thread-show") {
      if (command.json) {
        io.writeStdout(
          `${JSON.stringify(
            {
              threadId: command.threadId,
              mode: command.replay ? "render-only replay" : "inspection",
              events,
            },
            null,
            2,
          )}\n`,
        );
        return;
      }
      io.writeStdout(
        `Thread ${command.threadId} — ${events.length} events (${command.replay ? "render-only replay" : "inspection"})\n`,
      );
      for (const event of events) {
        io.writeStdout(renderEvent(event));
      }
      return;
    }

    if (command.kind === "thread-checkpoint") {
      const checkpoint = reader.createCheckpoint(command.threadId);
      if (command.json) {
        io.writeStdout(`${JSON.stringify({ database: filename, checkpoint }, null, 2)}\n`);
      } else {
        io.writeStdout(
          `Checkpointed Thread ${command.threadId} through sequence ${checkpoint.throughSequence} (${checkpoint.digest}).\n`,
        );
      }
      return;
    }

    if (command.kind === "thread-verify") {
      const checkpoint = reader.latestCheckpoint(command.threadId);
      if (checkpoint === undefined) {
        throw new Error(`No checkpoint for Thread: ${command.threadId}`);
      }
      if (!reader.verifyCheckpoint(checkpoint)) {
        throw new Error(`Thread checkpoint verification failed: ${command.threadId}`);
      }
      if (command.json) {
        io.writeStdout(
          `${JSON.stringify({ database: filename, valid: true, checkpoint }, null, 2)}\n`,
        );
      } else {
        io.writeStdout(
          `Verified Thread ${command.threadId} through sequence ${checkpoint.throughSequence}.\n`,
        );
      }
      return;
    }

    if (command.kind === "thread-retention-plan") {
      const path = resolve(io.cwd, command.artifact);
      const artifact = await readProtectedThreadArtifact(path);
      const checkpoint = reader.checkpointAt(command.threadId, artifact.checkpoint.throughSequence);
      if (checkpoint === undefined) {
        throw new Error(
          `No persisted checkpoint for Thread ${command.threadId} at sequence ${artifact.checkpoint.throughSequence}.`,
        );
      }
      const plan = planThreadRetention(events, checkpoint, artifact);
      if (command.json) {
        io.writeStdout(`${JSON.stringify({ artifact: path, plan }, null, 2)}\n`);
      } else {
        io.writeStdout(
          `Retention dry-run for Thread ${command.threadId}: would remove sequences ${plan.removable.firstSequence}-${plan.removable.lastSequence} (${plan.removable.eventCount} events) and retain sequences ${plan.retained.firstSequence}-${plan.retained.lastSequence} (${plan.retained.eventCount} events).\nNo events were deleted. Protected artifact: ${path}\n`,
        );
      }
      return;
    }

    const checkpoint = reader.createCheckpoint(command.threadId);
    const artifact = createThreadArtifact(events.slice(0, checkpoint.eventCount), checkpoint);
    const path = await writeThreadArtifact(resolve(io.cwd, command.output), artifact);
    if (command.json) {
      io.writeStdout(`${JSON.stringify({ path, checkpoint }, null, 2)}\n`);
    } else {
      io.writeStdout(
        `Exported Thread ${command.threadId} through sequence ${checkpoint.throughSequence} to ${path}.\n`,
      );
    }
  } finally {
    reader.close();
  }
}

async function runQuest(command: Extract<CliCommand, { kind: "run" }>, io: CliIo): Promise<void> {
  const persistentThread = command.ephemeral
    ? undefined
    : new SqliteThread({
        filename: databasePath(io.cwd, command.database),
        ...(command.threadId === undefined ? {} : { threadId: command.threadId }),
      });
  const thread = persistentThread ?? new InMemoryThread(command.threadId);
  const authority = new ApprovalAuthority();
  const approval = command.allowShell
    ? authority.issue({ effect: "shell.execute", actor: "athena" })
    : undefined;
  const policy = command.allowShell
    ? new ApprovalPolicy(authority, new ReadOnlyPolicy())
    : new ReadOnlyPolicy();
  const broker = new HostEffectBroker(policy, thread);
  const credentials = new EnvironmentCredentialBroker(io.environment);
  const olympus = new Olympus({
    audit: thread,
    hostServices: [hostService(EFFECT_BROKER, broker), hostService(CREDENTIAL_BROKER, credentials)],
  });

  try {
    await olympus.compose([
      createAthenaPlugin(),
      toolPlugin(command, approval?.id),
      oraclePlugin(command, io),
    ]);
    const result = await olympus.use(AGENT_RUNNER).run(command.objective);
    if (command.json) {
      io.writeStdout(
        `${JSON.stringify(
          {
            result,
            thread: { id: thread.id, persistent: persistentThread !== undefined },
            events: thread.snapshot(),
          },
          null,
          2,
        )}\n`,
      );
    } else {
      io.writeStdout(
        `${result.answer}\nThread: ${thread.id}${persistentThread === undefined ? " (ephemeral)" : ""}\n`,
      );
    }
  } finally {
    await olympus.shutdown();
    persistentThread?.close();
  }
}

function publicErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown failure";
  }
  if (
    error.cause instanceof Error &&
    error.cause.message.startsWith("Required credential is unavailable:")
  ) {
    return error.cause.message;
  }
  return error.message;
}

export async function main(args: readonly string[], io: CliIo): Promise<number> {
  try {
    const command = parseCliCommand(args, io.cwd);
    if (command.kind === "help") {
      io.writeStdout(helpText);
      return 0;
    }
    if (command.kind !== "run") {
      await handleThreadCommand(command, io);
      return 0;
    }
    await runQuest(command, io);
    return 0;
  } catch (error) {
    io.writeStderr(`Error: ${publicErrorMessage(error)}\n`);
    return 1;
  }
}
