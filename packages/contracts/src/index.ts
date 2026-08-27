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
  invoke(
    call: ToolCall,
    actor: string,
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
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
