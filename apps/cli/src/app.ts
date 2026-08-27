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
  SqliteThread,
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

// SAFETY: core exports these runtime APIs; the casts bridge stale workspace declarations.
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
};
const { ApprovalAuthority, ApprovalPolicy, CREDENTIAL_BROKER, EnvironmentCredentialBroker } =
  CoreRuntime;

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

interface ThreadSummaryView {
  readonly id: string;
  readonly createdAt: string;
  readonly eventCount: number;
}

interface ThreadInspector {
  listThreads(): readonly ThreadSummaryView[];
  readThread(threadId: string): readonly ThreadEvent[];
  close(): void;
}

function openThreadInspector(filename: string): ThreadInspector {
  const thread: object = new SqliteThread({ filename });
  return thread as ThreadInspector;
}

function renderEvent(event: ThreadEvent): string {
  const heading = `${String(event.sequence).padStart(4, "0")} ${event.timestamp} ${event.type} [${event.actor}]`;
  return `${heading}\n${JSON.stringify(event.payload, null, 2)}\n`;
}

function inspectThreads(
  command: Extract<CliCommand, { kind: "thread-list" | "thread-show" }>,
  io: CliIo,
): void {
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
    if (command.kind === "thread-list" || command.kind === "thread-show") {
      inspectThreads(command, io);
      return 0;
    }
    await runQuest(command, io);
    return 0;
  } catch (error) {
    io.writeStderr(`Error: ${publicErrorMessage(error)}\n`);
    return 1;
  }
}
