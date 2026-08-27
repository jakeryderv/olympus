import { randomUUID } from "node:crypto";
import {
  AGENT_RUNNER,
  type AgentRunner,
  ORACLE,
  type Oracle,
  OracleError,
  type QuestOptions,
  type QuestResult,
  TOOL_CATALOG,
  type ToolCatalog,
} from "@olympus/contracts";
import {
  type OlympusContext,
  type OlympusPlugin,
  PLUGIN_MANIFEST_API_VERSION,
} from "@olympus/core";

export * from "@olympus/contracts";

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
        const output = await this.#tools.invoke(toolCall, "athena", correlationId, options.signal);
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
  const plugin = {
    name: "athena/default",
    manifest: {
      apiVersion: PLUGIN_MANIFEST_API_VERSION,
      id: "athena/default",
      version: "0.1.0",
      trust: { mode: "trusted-in-process" as const },
      capabilities: {
        requires: [ORACLE.name, TOOL_CATALOG.name],
        provides: [AGENT_RUNNER.name],
      },
      configuration: { schema: { type: "object", additionalProperties: false } },
    },
    config: {},
    requires: [ORACLE, TOOL_CATALOG],
    provides: [AGENT_RUNNER],
    setup(context: OlympusContext) {
      context.provide(
        AGENT_RUNNER,
        new AthenaRunner(context.use(ORACLE), context.use(TOOL_CATALOG), context),
      );
    },
  };
  return plugin;
}
