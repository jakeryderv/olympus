import { randomUUID } from "node:crypto";
import type { OlympusContext, OlympusPlugin } from "@olympus/core";
import { serviceKey } from "@olympus/core";

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
}

export interface ToolCall {
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResult {
  readonly name: string;
  readonly output: unknown;
}

export interface OracleRequest {
  readonly objective: string;
  readonly tools: readonly ToolDefinition[];
  readonly toolResult?: ToolResult;
}

export interface OracleResponse {
  readonly message: string;
  readonly toolCall?: ToolCall;
}

export interface Oracle {
  generate(request: OracleRequest): Promise<OracleResponse>;
}

export interface ToolCatalog {
  definitions(): readonly ToolDefinition[];
  invoke(call: ToolCall, actor: string, correlationId: string): Promise<unknown>;
}

export interface QuestResult {
  readonly answer: string;
  readonly correlationId: string;
  readonly toolCalls: readonly string[];
}

export interface AgentRunner {
  run(objective: string): Promise<QuestResult>;
}

export const ORACLE = serviceKey<Oracle>("olympus.oracle");
export const TOOL_CATALOG = serviceKey<ToolCatalog>("olympus.tools");
export const AGENT_RUNNER = serviceKey<AgentRunner>("olympus.agent-runner");

class AthenaRunner implements AgentRunner {
  readonly #oracle: Oracle;
  readonly #tools: ToolCatalog;
  readonly #context: OlympusContext;

  constructor(oracle: Oracle, tools: ToolCatalog, context: OlympusContext) {
    this.#oracle = oracle;
    this.#tools = tools;
    this.#context = context;
  }

  async run(objective: string): Promise<QuestResult> {
    const correlationId = randomUUID();
    const toolCalls: string[] = [];
    await this.#context.emit("quest.started", { objective, correlationId });
    try {
      await this.#context.emit("oracle.called", { correlationId });
      let response = await this.#oracle.generate({
        objective,
        tools: this.#tools.definitions(),
      });
      if (response.toolCall !== undefined) {
        toolCalls.push(response.toolCall.name);
        await this.#context.emit("tool.requested", {
          correlationId,
          tool: response.toolCall.name,
        });
        const output = await this.#tools.invoke(response.toolCall, "athena", correlationId);
        await this.#context.emit("oracle.called", { correlationId, afterTool: true });
        response = await this.#oracle.generate({
          objective,
          tools: this.#tools.definitions(),
          toolResult: { name: response.toolCall.name, output },
        });
        if (response.toolCall !== undefined) {
          throw new Error("Athena v0 permits at most one tool call per quest.");
        }
      }
      await this.#context.emit("quest.completed", { correlationId });
      return { answer: response.message, correlationId, toolCalls };
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
