import { Buffer } from "node:buffer";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from "openai";
import {
  type JsonSchema,
  ORACLE,
  type Oracle,
  OracleError,
  type OracleRequest,
  type OracleResponse,
  type OracleStreamEvent,
  type ToolCall,
} from "@olympus/contracts";
import {
  CREDENTIAL_BROKER,
  type OlympusContext,
  type OlympusPlugin,
  PLUGIN_MANIFEST_API_VERSION,
} from "@olympus/core";
import {
  type OpenAIFunctionCall,
  type OpenAIFunctionTool,
  type OpenAIInput,
  type OpenAITransport,
  type OpenAITransportRequest,
  type OpenAITransportResponse,
  SdkOpenAITransport,
} from "./transport.js";

export * from "./transport.js";

interface ContinuationState {
  readonly callId: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export interface OpenAIAdapterOptions {
  readonly model?: string;
  readonly credentialName?: string;
  readonly transportFactory?: (apiKey: string) => OpenAITransport;
}

const defaultInputSchema: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

function encodeContinuation(call: OpenAIFunctionCall): string {
  return Buffer.from(JSON.stringify(call), "utf8").toString("base64url");
}

function decodeContinuation(value: string): ContinuationState {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("callId" in parsed) ||
      !("name" in parsed) ||
      !("argumentsJson" in parsed) ||
      typeof parsed.callId !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.argumentsJson !== "string"
    ) {
      throw new Error("Invalid continuation shape.");
    }
    return {
      callId: parsed.callId,
      name: parsed.name,
      argumentsJson: parsed.argumentsJson,
    };
  } catch (error) {
    throw new OracleError("OpenAI continuation token is invalid.", {
      code: "invalid_request",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
}

function parseToolInput(argumentsJson: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Function arguments must be a JSON object.");
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch (error) {
    throw new OracleError("OpenAI returned invalid function arguments.", {
      code: "invalid_request",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
}

function serializeToolOutput(output: unknown): string {
  try {
    return JSON.stringify(output) ?? "null";
  } catch (error) {
    throw new OracleError("Tool output cannot be serialized for OpenAI.", {
      code: "invalid_request",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
}

function inputFor(request: OracleRequest): OpenAIInput {
  if (request.toolResult === undefined || request.continuation === undefined) {
    if (request.toolResult === undefined) {
      return request.objective;
    }
    return `${request.objective}\n\nTool result (${request.toolResult.name}): ${serializeToolOutput(
      request.toolResult.output,
    )}`;
  }
  const continuation = decodeContinuation(request.continuation);
  return [
    { role: "user", content: request.objective },
    {
      type: "function_call",
      call_id: continuation.callId,
      name: continuation.name,
      arguments: continuation.argumentsJson,
    },
    {
      type: "function_call_output",
      call_id: request.toolResult.callId ?? continuation.callId,
      output: serializeToolOutput(request.toolResult.output),
    },
  ];
}

function toolsFor(request: OracleRequest): readonly OpenAIFunctionTool[] {
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? defaultInputSchema,
  }));
}

function toolCallFrom(call: OpenAIFunctionCall | undefined): ToolCall | undefined {
  if (call === undefined) {
    return undefined;
  }
  return {
    id: call.callId,
    name: call.name,
    input: parseToolInput(call.argumentsJson),
  };
}

function responseFrom(response: OpenAITransportResponse): OracleResponse {
  const toolCall = toolCallFrom(response.functionCall);
  return {
    message: response.text,
    ...(toolCall === undefined ? {} : { toolCall }),
    ...(response.functionCall === undefined
      ? {}
      : { continuation: encodeContinuation(response.functionCall) }),
    metadata: {
      provider: "openai",
      model: response.model,
      requestId: response.id,
      ...(response.usage === undefined ? {} : { usage: response.usage }),
    },
  };
}

function transportRequest(model: string, request: OracleRequest): OpenAITransportRequest {
  return {
    model,
    input: inputFor(request),
    tools: toolsFor(request),
  };
}

export function normalizeOpenAIError(error: unknown, signal?: AbortSignal): OracleError {
  if (signal?.aborted || error instanceof APIUserAbortError) {
    return new OracleError("OpenAI request was cancelled.", {
      code: "cancelled",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
  if (error instanceof AuthenticationError) {
    return new OracleError("OpenAI authentication failed.", {
      code: "authentication",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
  if (error instanceof RateLimitError) {
    return new OracleError("OpenAI rate limit exceeded.", {
      code: "rate_limited",
      retryable: true,
      provider: "openai",
      cause: error,
    });
  }
  if (error instanceof BadRequestError) {
    return new OracleError("OpenAI rejected the request.", {
      code: "invalid_request",
      retryable: false,
      provider: "openai",
      cause: error,
    });
  }
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return new OracleError("OpenAI is unavailable.", {
      code: "unavailable",
      retryable: true,
      provider: "openai",
      cause: error,
    });
  }
  if (error instanceof APIError && error.status !== undefined && error.status >= 500) {
    return new OracleError("OpenAI returned a server error.", {
      code: "server_error",
      retryable: true,
      provider: "openai",
      cause: error,
    });
  }
  return new OracleError("OpenAI request failed.", {
    code: "unknown",
    retryable: false,
    provider: "openai",
    cause: error,
  });
}

export class OpenAIOracle implements Oracle {
  readonly #transport: OpenAITransport;
  readonly #model: string;

  constructor(transport: OpenAITransport, model: string) {
    this.#transport = transport;
    this.#model = model;
  }

  async generate(request: OracleRequest): Promise<OracleResponse> {
    try {
      const response = await this.#transport.create(
        transportRequest(this.#model, request),
        request.signal,
      );
      return responseFrom(response);
    } catch (error) {
      throw normalizeOpenAIError(error, request.signal);
    }
  }

  async *stream(request: OracleRequest): AsyncIterable<OracleStreamEvent> {
    try {
      for await (const event of this.#transport.stream(
        transportRequest(this.#model, request),
        request.signal,
      )) {
        if (event.type === "text-delta") {
          yield { type: "text.delta", delta: event.delta };
        } else {
          const response = responseFrom(event.response);
          if (response.toolCall !== undefined) {
            yield { type: "tool.call", call: response.toolCall };
          }
          yield { type: "completed", response };
        }
      }
    } catch (error) {
      throw normalizeOpenAIError(error, request.signal);
    }
  }
}

export function createOpenAIPlugin(options: OpenAIAdapterOptions = {}): OlympusPlugin {
  const config = {
    model: options.model ?? "gpt-5.6",
    credentialName: options.credentialName ?? "OPENAI_API_KEY",
  };
  const transportFactory = options.transportFactory ?? ((apiKey) => new SdkOpenAITransport(apiKey));
  const name = "delphi/openai-responses";
  const plugin = {
    name,
    manifest: {
      apiVersion: PLUGIN_MANIFEST_API_VERSION,
      id: name,
      version: "0.1.0",
      trust: { mode: "trusted-in-process" as const },
      capabilities: {
        requires: [CREDENTIAL_BROKER.name],
        provides: [ORACLE.name],
      },
      configuration: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["model", "credentialName"],
          properties: {
            model: { type: "string", minLength: 1 },
            credentialName: { type: "string", pattern: "^[A-Z][A-Z0-9_]*$" },
          },
        },
      },
    },
    config,
    requires: [CREDENTIAL_BROKER],
    provides: [ORACLE],
    setup(context: OlympusContext) {
      const credentialBroker = context.use(CREDENTIAL_BROKER);
      const apiKey = credentialBroker.get(config.credentialName).reveal();
      context.provide(ORACLE, new OpenAIOracle(transportFactory(apiKey), config.model));
    },
  };
  return plugin;
}
