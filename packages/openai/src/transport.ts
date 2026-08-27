import OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";

export interface OpenAIFunctionTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export type OpenAIInput =
  | string
  | readonly (
      | { readonly role: "user"; readonly content: string }
      | {
          readonly type: "function_call";
          readonly call_id: string;
          readonly name: string;
          readonly arguments: string;
        }
      | {
          readonly type: "function_call_output";
          readonly call_id: string;
          readonly output: string;
        }
    )[];

export interface OpenAITransportRequest {
  readonly model: string;
  readonly input: OpenAIInput;
  readonly tools: readonly OpenAIFunctionTool[];
}

export interface OpenAIFunctionCall {
  readonly callId: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export interface OpenAITransportResponse {
  readonly id: string;
  readonly model: string;
  readonly text: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly functionCall?: OpenAIFunctionCall;
}

export type OpenAITransportStreamEvent =
  | { readonly type: "text-delta"; readonly delta: string }
  | { readonly type: "completed"; readonly response: OpenAITransportResponse };

export interface OpenAITransport {
  create(request: OpenAITransportRequest, signal?: AbortSignal): Promise<OpenAITransportResponse>;
  stream(
    request: OpenAITransportRequest,
    signal?: AbortSignal,
  ): AsyncIterable<OpenAITransportStreamEvent>;
}

function functionCallFrom(response: Response): ResponseFunctionToolCall | undefined {
  return response.output.find(
    (item): item is ResponseFunctionToolCall => item.type === "function_call",
  );
}

function normalizeResponse(response: Response): OpenAITransportResponse {
  const functionCall = functionCallFrom(response);
  return {
    id: response.id,
    model: response.model,
    text: response.output_text,
    ...(response.usage === undefined
      ? {}
      : {
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.total_tokens,
          },
        }),
    ...(functionCall === undefined
      ? {}
      : {
          functionCall: {
            callId: functionCall.call_id,
            name: functionCall.name,
            argumentsJson: functionCall.arguments,
          },
        }),
  };
}

function functionTools(tools: readonly OpenAIFunctionTool[]): FunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: { ...tool.parameters },
    strict: false,
  }));
}

function requestOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

function nonStreamingParams(request: OpenAITransportRequest): ResponseCreateParamsNonStreaming {
  return {
    model: request.model,
    input: request.input as NonNullable<ResponseCreateParamsNonStreaming["input"]>,
    tools: functionTools(request.tools),
    parallel_tool_calls: false,
    store: false,
  };
}

function streamingParams(request: OpenAITransportRequest): ResponseCreateParamsStreaming {
  return { ...nonStreamingParams(request), stream: true };
}

export class SdkOpenAITransport implements OpenAITransport {
  readonly #client: OpenAI;

  constructor(apiKey: string) {
    this.#client = new OpenAI({ apiKey });
  }

  async create(
    request: OpenAITransportRequest,
    signal?: AbortSignal,
  ): Promise<OpenAITransportResponse> {
    const response = await this.#client.responses.create(
      nonStreamingParams(request),
      requestOptions(signal),
    );
    return normalizeResponse(response);
  }

  async *stream(
    request: OpenAITransportRequest,
    signal?: AbortSignal,
  ): AsyncIterable<OpenAITransportStreamEvent> {
    const stream = await this.#client.responses.create(
      streamingParams(request),
      requestOptions(signal),
    );
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield { type: "text-delta", delta: event.delta };
      }
      if (event.type === "response.completed") {
        yield { type: "completed", response: normalizeResponse(event.response) };
      }
      if (
        event.type === "error" ||
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      ) {
        throw new Error(`OpenAI streaming response failed: ${event.type}`);
      }
    }
  }
}
