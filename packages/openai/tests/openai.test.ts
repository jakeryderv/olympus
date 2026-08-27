import { ORACLE, type OracleRequest } from "@olympus/athena";
import { InMemoryThread, Olympus, hostService, type ServiceKey } from "@olympus/core";
import { describe, expect, it } from "vitest";
import {
  createOpenAIPlugin,
  normalizeOpenAIError,
  OpenAIOracle,
  type OpenAITransport,
  type OpenAITransportRequest,
  type OpenAITransportResponse,
  type OpenAITransportStreamEvent,
} from "../src/index.js";

class FakeTransport implements OpenAITransport {
  readonly requests: OpenAITransportRequest[] = [];
  readonly #responses: OpenAITransportResponse[];
  readonly #streamEvents: OpenAITransportStreamEvent[];

  constructor(
    responses: OpenAITransportResponse[],
    streamEvents: OpenAITransportStreamEvent[] = [],
  ) {
    this.#responses = [...responses];
    this.#streamEvents = streamEvents;
  }

  async create(request: OpenAITransportRequest): Promise<OpenAITransportResponse> {
    this.requests.push(request);
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error("No fake response configured.");
    }
    return response;
  }

  async *stream(request: OpenAITransportRequest): AsyncIterable<OpenAITransportStreamEvent> {
    this.requests.push(request);
    for (const event of this.#streamEvents) {
      yield event;
    }
  }
}

interface ContinuableResponse {
  readonly continuation?: string;
}

const completedResponse: OpenAITransportResponse = {
  id: "resp_1",
  model: "gpt-test",
  text: "done",
  usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
};

describe("OpenAI Responses adapter", () => {
  it("normalizes text, usage, request metadata, and tool schemas", async () => {
    const transport = new FakeTransport([completedResponse]);
    const oracle = new OpenAIOracle(transport, "gpt-test");
    const tool = {
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    };
    const response = await oracle.generate({
      objective: "inspect",
      tools: [tool],
    });

    expect(response).toEqual({
      message: "done",
      metadata: {
        provider: "openai",
        model: "gpt-test",
        requestId: "resp_1",
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    });
    expect(transport.requests[0]?.tools[0]).toEqual({
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
    });
  });

  it("round-trips a normalized function call without remote response storage", async () => {
    const transport = new FakeTransport([
      {
        ...completedResponse,
        id: "resp_tool",
        text: "",
        functionCall: {
          callId: "call_1",
          name: "read_file",
          argumentsJson: '{"path":"README.md"}',
        },
      },
      { ...completedResponse, id: "resp_final", text: "The file is readable." },
    ]);
    const oracle = new OpenAIOracle(transport, "gpt-test");
    const first = await oracle.generate({
      objective: "Read the README",
      tools: [{ name: "read_file", description: "Read a file" }],
    });
    expect(first.toolCall).toEqual({
      id: "call_1",
      name: "read_file",
      input: { path: "README.md" },
    });

    const continuable = first as ContinuableResponse;
    expect(continuable.continuation).toBeDefined();
    const continuation = continuable.continuation;
    if (continuation === undefined) {
      throw new Error("Expected an OpenAI continuation token.");
    }
    const followUpRequest: OracleRequest & {
      readonly continuation: string;
      readonly toolResult: {
        readonly callId: string;
        readonly name: string;
        readonly output: { readonly content: string };
      };
    } = {
      objective: "Read the README",
      tools: [{ name: "read_file", description: "Read a file" }],
      continuation,
      toolResult: {
        callId: "call_1",
        name: "read_file",
        output: { content: "# Olympus" },
      },
    };
    const second = await oracle.generate(followUpRequest);
    expect(second.message).toBe("The file is readable.");
    expect(transport.requests[1]?.input).toEqual([
      { role: "user", content: "Read the README" },
      {
        type: "function_call",
        call_id: "call_1",
        name: "read_file",
        arguments: '{"path":"README.md"}',
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"content":"# Olympus"}',
      },
    ]);
  });

  it("normalizes streaming deltas and completion", async () => {
    const transport = new FakeTransport(
      [],
      [
        { type: "text-delta", delta: "hel" },
        { type: "text-delta", delta: "lo" },
        { type: "completed", response: completedResponse },
      ],
    );
    const oracle = new OpenAIOracle(transport, "gpt-test");
    const events: object[] = [];
    for await (const event of oracle.stream({ objective: "hello", tools: [] })) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "text.delta", delta: "hel" },
      { type: "text.delta", delta: "lo" },
      {
        type: "completed",
        response: expect.objectContaining({
          message: "done",
          metadata: expect.objectContaining({ provider: "openai", requestId: "resp_1" }),
        }),
      },
    ]);
  });

  it("normalizes cancellation and keeps credentials outside plugin events", async () => {
    const controller = new AbortController();
    controller.abort("test cancellation");
    const error = normalizeOpenAIError(new Error("transport aborted"), controller.signal);
    expect(error.name).toBe("OracleError");
    expect(error.code).toBe("cancelled");
    expect(error.retryable).toBe(false);

    let observedKey = "";
    const transport = new FakeTransport([completedResponse]);
    const plugin = createOpenAIPlugin({
      model: "gpt-test",
      transportFactory: (apiKey) => {
        observedKey = apiKey;
        return transport;
      },
    });
    const credentialKey = plugin.requires?.[0] as
      | ServiceKey<{ get(name: string): { reveal(): string } }>
      | undefined;
    if (credentialKey === undefined) {
      throw new Error("OpenAI plugin did not declare its credential dependency.");
    }
    const thread = new InMemoryThread();
    const olympus = new Olympus({
      audit: thread,
      hostServices: [
        hostService(credentialKey, {
          get: () => ({ reveal: () => "private-test-key" }),
        }),
      ],
    });
    await olympus.compose([plugin]);
    const response = await olympus.use(ORACLE).generate({ objective: "hello", tools: [] });
    expect(response.message).toBe("done");
    expect(observedKey).toBe("private-test-key");
    expect(JSON.stringify(thread.snapshot())).not.toContain("private-test-key");
    await olympus.shutdown();
  });
});
