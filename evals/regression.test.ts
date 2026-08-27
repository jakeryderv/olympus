import { readFile } from "node:fs/promises";
import { createAthenaPlugin } from "@olympus/athena";
import { AGENT_RUNNER } from "@olympus/contracts";
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

interface EvalCase {
  readonly name: string;
  readonly model: ModelVariant;
  readonly tools: ToolVariant;
  readonly objective: string;
  readonly expectedText: string;
  readonly expectedToolCalls: readonly string[];
}

const cases = JSON.parse(
  await readFile(new URL("./cases.json", import.meta.url), "utf8"),
) as EvalCase[];

describe("behavioral regression suite", () => {
  for (const evalCase of cases) {
    it(evalCase.name, async () => {
      const thread = new InMemoryThread(`eval:${evalCase.name}`);
      const broker = new HostEffectBroker(new ReadOnlyPolicy(), thread);
      const olympus = new Olympus({
        audit: thread,
        hostServices: [hostService(EFFECT_BROKER, broker)],
      });
      await olympus.compose([
        createAthenaPlugin(),
        createToolPlugin(evalCase.tools, process.cwd()),
        createModelPlugin(evalCase.model),
      ]);
      try {
        const result = await olympus.use(AGENT_RUNNER).run(evalCase.objective);
        expect(result.answer).toContain(evalCase.expectedText);
        expect(result.toolCalls).toEqual(evalCase.expectedToolCalls);
      } finally {
        await olympus.shutdown();
      }
    });
  }
});
