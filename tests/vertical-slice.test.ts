import { AGENT_RUNNER, createAthenaPlugin } from "@olympus/athena";
import {
  EFFECT_BROKER,
  HostEffectBroker,
  InMemoryThread,
  Olympus,
  ReadOnlyPolicy,
  hostService,
} from "@olympus/core";
import {
  createModelPlugin,
  createToolPlugin,
  type ModelVariant,
  type ToolVariant,
} from "@olympus/reference";
import { describe, expect, it } from "vitest";

async function run(model: ModelVariant, tools: ToolVariant, objective: string) {
  const thread = new InMemoryThread("acceptance");
  const broker = new HostEffectBroker(new ReadOnlyPolicy(), thread);
  const olympus = new Olympus({
    audit: thread,
    hostServices: [hostService(EFFECT_BROKER, broker)],
  });
  await olympus.compose([
    createAthenaPlugin(),
    createToolPlugin(tools, process.cwd()),
    createModelPlugin(model),
  ]);
  try {
    const result = await olympus.use(AGENT_RUNNER).run(objective);
    return { result, eventTypes: thread.snapshot().map((event) => event.type) };
  } finally {
    await olympus.shutdown();
  }
}

describe("safe vertical slice", () => {
  it("swaps model implementations without changing Athena or semantic events", async () => {
    const echo = await run("echo", "fake", "hello");
    const uppercase = await run("uppercase", "fake", "hello");

    expect(echo.result.answer).toBe("Echo: hello");
    expect(uppercase.result.answer).toBe("HELLO");
    expect(echo.eventTypes).toEqual(uppercase.eventTypes);
    expect(echo.eventTypes).toEqual(["quest.started", "oracle.called", "quest.completed"]);
  });

  it("swaps tool implementations behind the host effect broker", async () => {
    const fake = await run("inspection", "fake", "list");
    const repository = await run("inspection", "repository", "list");

    expect(fake.result.toolCalls).toEqual(["list_files"]);
    expect(repository.result.toolCalls).toEqual(["list_files"]);
    expect(fake.eventTypes).toEqual(repository.eventTypes);
    expect(fake.eventTypes).toContain("effect.authorized");
    expect(fake.eventTypes).toContain("effect.completed");
  });

  it("prevents read tools from escaping the configured repository root", async () => {
    await expect(run("inspection", "repository", "read /etc/hosts")).rejects.toThrow(
      "Path escapes the configured repository root",
    );
  });
});
