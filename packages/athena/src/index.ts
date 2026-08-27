import { randomUUID } from "node:crypto";
import type { OlympusContext, OlympusPlugin } from "@olympus/core";
import { serviceKey } from "@olympus/core";

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: JsonSchema;
}

export interface ToolCall {
  readonly id?: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResult {
  readonly callId?: string;
  readonly name: string;
  readonly output: unknown;
}

export interface OracleRequest {
  readonly objective: string;
  readonly tools: readonly ToolDefinition[];
  readonly toolResult?: ToolResult;
  readonly continuation?: string;
  readonly signal?: AbortSignal;
}

export interface OracleUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface OracleMetadata {
  readonly provider: string;
  readonly model: string;
  readonly requestId?: string;
  readonly usage?: OracleUsage;
}

export interface OracleResponse {
  readonly message: string;
  readonly toolCall?: ToolCall;
  readonly continuation?: string;
  readonly metadata?: OracleMetadata;
}

export type OracleErrorCode =
  | "authentication"
  | "cancelled"
  | "invalid_request"
  | "rate_limited"
  | "server_error"
  | "unavailable"
  | "unknown";

export class OracleError extends Error {
  readonly code: OracleErrorCode;
  readonly retryable: boolean;
  readonly provider: string;

  constructor(
    message: string,
    options: {
      readonly code: OracleErrorCode;
      readonly retryable: boolean;
      readonly provider: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OracleError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.provider = options.provider;
  }
}

export type OracleStreamEvent =
  | { readonly type: "text.delta"; readonly delta: string }
  | { readonly type: "tool.call"; readonly call: ToolCall }
  | { readonly type: "completed"; readonly response: OracleResponse };

export interface Oracle {
  generate(request: OracleRequest): Promise<OracleResponse>;
  stream?(request: OracleRequest): AsyncIterable<OracleStreamEvent>;
}

export interface ToolCatalog {
  definitions(): readonly ToolDefinition[];
  invoke(call: ToolCall, actor: string, correlationId: string): Promise<unknown>;
}

export interface QuestOptions {
  readonly signal?: AbortSignal;
}

export interface QuestResult {
  readonly answer: string;
  readonly correlationId: string;
  readonly toolCalls: readonly string[];
  readonly oracle?: OracleMetadata;
}

export interface AgentRunner {
  run(objective: string, options?: QuestOptions): Promise<QuestResult>;
}

export const ORACLE = serviceKey<Oracle>("olympus.oracle");
export const TOOL_CATALOG = serviceKey<ToolCatalog>("olympus.tools");
export const AGENT_RUNNER = serviceKey<AgentRunner>("olympus.agent-runner");

function ensureNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new OracleError("Oracle request was cancelled.", {
      code: "cancelled",
      retryable: false,
      provider: "unknown",
      cause: signal.reason,
    });
  }
}

class AthenaRunner implements AgentRunner {
  readonly #oracle: Oracle;
  readonly #tools: ToolCatalog;
  readonly #context: OlympusContext;

  constructor(oracle: Oracle, tools: ToolCatalog, context: OlympusContext) {
    this.#oracle = oracle;
    this.#tools = tools;
    this.#context = context;
  }

  async run(objective: string, options: QuestOptions = {}): Promise<QuestResult> {
    const correlationId = randomUUID();
    const toolCalls: string[] = [];
    await this.#context.emit("quest.started", { objective, correlationId });
    try {
      ensureNotCancelled(options.signal);
      await this.#context.emit("oracle.called", { correlationId });
      let response = await this.#oracle.generate({
        objective,
        tools: this.#tools.definitions(),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      await this.#context.emit("oracle.completed", {
        correlationId,
        ...(response.metadata === undefined ? {} : { metadata: response.metadata }),
      });
      if (response.toolCall !== undefined) {
        const toolCall = response.toolCall;
        toolCalls.push(toolCall.name);
        await this.#context.emit("tool.requested", {
          correlationId,
          tool: toolCall.name,
        });
        const output = await this.#tools.invoke(toolCall, "athena", correlationId);
        ensureNotCancelled(options.signal);
        await this.#context.emit("oracle.called", { correlationId, afterTool: true });
        response = await this.#oracle.generate({
          objective,
          tools: this.#tools.definitions(),
          toolResult: {
            ...(toolCall.id === undefined ? {} : { callId: toolCall.id }),
            name: toolCall.name,
            output,
          },
          ...(response.continuation === undefined ? {} : { continuation: response.continuation }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        await this.#context.emit("oracle.completed", {
          correlationId,
          afterTool: true,
          ...(response.metadata === undefined ? {} : { metadata: response.metadata }),
        });
        if (response.toolCall !== undefined) {
          throw new Error("Athena v0 permits at most one tool call per quest.");
        }
      }
      await this.#context.emit("quest.completed", { correlationId });
      return {
        answer: response.message,
        correlationId,
        toolCalls,
        ...(response.metadata === undefined ? {} : { oracle: response.metadata }),
      };
    } catch (error) {
      await this.#context.emit("quest.failed", {
        correlationId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}

export function createAthenaPlugin(): OlympusPlugin {
  return {
    name: "athena/default",
    requires: [ORACLE, TOOL_CATALOG],
    provides: [AGENT_RUNNER],
    setup(context) {
      context.provide(
        AGENT_RUNNER,
        new AthenaRunner(context.use(ORACLE), context.use(TOOL_CATALOG), context),
      );
    },
  };
}
