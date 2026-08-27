import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { parse as parsePath } from "node:path";
import {
  EFFECT_BROKER,
  type EffectBroker,
  type OlympusContext,
  type OlympusPlugin,
} from "@olympus/core";
import {
  TOOL_CATALOG,
  type ToolCall,
  type ToolCatalog,
  type ToolDefinition,
} from "@olympus/athena";

export const DOCKER_SHELL_EFFECT = "shell.execute";

export interface ShellExecuteInput {
  readonly argv: readonly string[];
  readonly cwd?: string;
}

export interface ShellExecuteResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface DockerInvocation {
  readonly containerName: string;
  readonly image: string;
  readonly workspaceRoot: string;
  readonly workdir: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export interface DockerClient {
  available(): Promise<boolean>;
  run(invocation: DockerInvocation, signal?: AbortSignal): Promise<ShellExecuteResult>;
}

export class DockerUnavailableError extends Error {
  constructor() {
    super("Docker is unavailable; guarded subprocess execution fails closed.");
    this.name = "DockerUnavailableError";
  }
}

export class SubprocessCancelledError extends Error {
  constructor() {
    super("Guarded subprocess execution was cancelled.");
    this.name = "SubprocessCancelledError";
  }
}

export class SubprocessTimeoutError extends Error {
  constructor() {
    super("Guarded subprocess execution exceeded its timeout.");
    this.name = "SubprocessTimeoutError";
  }
}

export class SubprocessOutputLimitError extends Error {
  constructor() {
    super("Guarded subprocess output exceeded its limit.");
    this.name = "SubprocessOutputLimitError";
  }
}

export function buildDockerRunArgs(invocation: DockerInvocation): readonly string[] {
  return [
    "run",
    "--rm",
    "--pull",
    "never",
    "--name",
    invocation.containerName,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--user",
    "65534:65534",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m",
    "--mount",
    `type=bind,src=${invocation.workspaceRoot},dst=/workspace,readonly`,
    "--workdir",
    invocation.workdir,
    "--env",
    "HOME=/tmp",
    invocation.image,
    ...invocation.argv,
  ];
}

interface CapturedProcessOptions {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
  readonly onTerminate?: () => void;
}

function capture(
  command: string,
  args: readonly string[],
  options: CapturedProcessOptions,
): Promise<ShellExecuteResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let terminalError: Error | undefined;
    const terminate = (error: Error) => {
      if (terminalError !== undefined) return;
      terminalError = error;
      options.onTerminate?.();
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => terminate(new SubprocessTimeoutError()), options.timeoutMs);
    const abort = () => terminate(new SubprocessCancelledError());
    options.signal?.addEventListener("abort", abort, { once: true });
    const append = (
      current: Buffer<ArrayBufferLike>,
      chunk: Buffer<ArrayBufferLike>,
    ): Buffer<ArrayBufferLike> => {
      if (current.byteLength + chunk.byteLength > options.maxOutputBytes) {
        terminate(new SubprocessOutputLimitError());
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout.on("data", (chunk: Buffer<ArrayBufferLike>) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer<ArrayBufferLike>) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      terminalError = error;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (terminalError !== undefined) reject(terminalError);
      else
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
        });
    });
    if (options.signal?.aborted === true) abort();
  });
}

export class DockerCliClient implements DockerClient {
  async available(): Promise<boolean> {
    try {
      const result = await capture("docker", ["version", "--format", "{{.Server.Version}}"], {
        timeoutMs: 5_000,
        maxOutputBytes: 8_192,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  run(invocation: DockerInvocation, signal?: AbortSignal): Promise<ShellExecuteResult> {
    const forceRemove = () => {
      const cleanup = spawn("docker", ["rm", "-f", invocation.containerName], {
        detached: true,
        stdio: "ignore",
      });
      cleanup.unref();
    };
    return capture("docker", buildDockerRunArgs(invocation), {
      timeoutMs: invocation.timeoutMs,
      maxOutputBytes: invocation.maxOutputBytes,
      ...(signal === undefined ? {} : { signal }),
      onTerminate: forceRemove,
    });
  }
}

export interface DockerToolPluginOptions {
  readonly image: string;
  readonly workspaceRoot: string;
  readonly approvalId?: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly client?: DockerClient;
}

function parseInput(value: unknown): ShellExecuteInput {
  if (
    value === null ||
    typeof value !== "object" ||
    !("argv" in value) ||
    !Array.isArray(value.argv)
  ) {
    throw new Error("shell_execute requires an argv array.");
  }
  const argv = value.argv;
  if (
    argv.length === 0 ||
    argv.length > 64 ||
    argv.some(
      (part) =>
        typeof part !== "string" || part.length === 0 || part.length > 4_096 || part.includes("\0"),
    )
  ) {
    throw new Error("shell_execute argv is invalid.");
  }
  const cwd = "cwd" in value ? value.cwd : undefined;
  if (
    cwd !== undefined &&
    (typeof cwd !== "string" ||
      cwd.startsWith("/") ||
      cwd.includes("\\") ||
      cwd.split("/").includes(".."))
  ) {
    throw new Error("shell_execute cwd must stay within the mounted workspace.");
  }
  return { argv, ...(cwd === undefined || cwd === "" ? {} : { cwd }) };
}

function validateOptions(options: DockerToolPluginOptions): void {
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(options.image))
    throw new Error("Docker image must be pinned by sha256 digest.");
  const timeout = options.timeoutMs ?? 30_000;
  const output = options.maxOutputBytes ?? 65_536;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 120_000)
    throw new Error("Docker timeout is outside the allowed range.");
  if (!Number.isSafeInteger(output) || output < 1_024 || output > 1_048_576)
    throw new Error("Docker output limit is outside the allowed range.");
}

class DockerToolCatalog implements ToolCatalog {
  readonly #broker: EffectBroker;
  readonly #approvalId: string | undefined;
  constructor(broker: EffectBroker, approvalId: string | undefined) {
    this.#broker = broker;
    this.#approvalId = approvalId;
  }
  definitions(): readonly ToolDefinition[] {
    return [
      {
        name: "shell_execute",
        description: "Run an argv command in a locked-down Docker container.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["argv"],
          properties: {
            argv: { type: "array", minItems: 1, maxItems: 64, items: { type: "string" } },
            cwd: { type: "string" },
          },
        },
      },
    ];
  }
  invoke(
    call: ToolCall,
    actor: string,
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (call.name !== "shell_execute") throw new Error(`Unknown Docker tool: ${call.name}`);
    return this.#broker.execute({
      effect: DOCKER_SHELL_EFFECT,
      input: parseInput(call.input),
      actor,
      correlationId,
      ...(this.#approvalId === undefined ? {} : { approvalId: this.#approvalId }),
      ...(signal === undefined ? {} : { signal }),
    });
  }
}

export function createDockerToolPlugin(options: DockerToolPluginOptions): OlympusPlugin {
  validateOptions(options);
  const config = {
    image: options.image,
    workspaceRoot: options.workspaceRoot,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxOutputBytes: options.maxOutputBytes ?? 65_536,
  };
  const name = "hermes/docker-shell";
  const client = options.client ?? new DockerCliClient();
  const plugin = {
    name,
    manifest: {
      apiVersion: "olympus.dev/v1alpha1" as const,
      id: name,
      version: "0.1.0",
      trust: { mode: "trusted-in-process" as const },
      capabilities: { requires: [EFFECT_BROKER.name], provides: [TOOL_CATALOG.name] },
      configuration: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["image", "workspaceRoot", "timeoutMs", "maxOutputBytes"],
          properties: {
            image: { type: "string", pattern: "^[^\\s@]+@sha256:[a-f0-9]{64}$" },
            workspaceRoot: { type: "string", minLength: 1 },
            timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
            maxOutputBytes: { type: "integer", minimum: 1024, maximum: 1048576 },
          },
        },
      },
    },
    config,
    requires: [EFFECT_BROKER],
    provides: [TOOL_CATALOG],
    async setup(context: OlympusContext) {
      if (!(await client.available())) throw new DockerUnavailableError();
      const workspaceRoot = await realpath(config.workspaceRoot);
      if (workspaceRoot === parsePath(workspaceRoot).root)
        throw new Error("Docker workspace root cannot be a filesystem root.");
      const broker = context.use(EFFECT_BROKER);
      // SAFETY: core's current broker passes the host execution context; this bridges stale workspace types.
      const guardedBroker = broker as unknown as {
        register<I, O>(
          effect: string,
          risk: "read" | "privileged",
          handler: (input: I, execution: { readonly signal?: AbortSignal }) => O | Promise<O>,
        ): { dispose(): void | Promise<void> };
      };
      context.defer(
        guardedBroker.register<ShellExecuteInput, ShellExecuteResult>(
          DOCKER_SHELL_EFFECT,
          "privileged",
          async (input: ShellExecuteInput, execution: { readonly signal?: AbortSignal }) => {
            const workdir = input.cwd === undefined ? "/workspace" : `/workspace/${input.cwd}`;
            const result = await client.run(
              {
                containerName: `olympus-${randomUUID()}`,
                image: config.image,
                workspaceRoot,
                workdir,
                argv: input.argv,
                timeoutMs: config.timeoutMs,
                maxOutputBytes: config.maxOutputBytes,
              },
              execution.signal,
            );
            if (
              Buffer.byteLength(result.stdout) > config.maxOutputBytes ||
              Buffer.byteLength(result.stderr) > config.maxOutputBytes
            )
              throw new SubprocessOutputLimitError();
            return result;
          },
        ),
      );
      context.provide(TOOL_CATALOG, new DockerToolCatalog(broker, options.approvalId));
    },
  };
  return plugin;
}
