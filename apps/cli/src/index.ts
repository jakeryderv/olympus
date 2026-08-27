#!/usr/bin/env node

import process from "node:process";
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

interface CliOptions {
  readonly json: boolean;
  readonly model: string;
  readonly root: string;
  readonly tools: string;
  readonly objective: string;
}

function parseCliOptions(args: readonly string[]): CliOptions {
  let json = false;
  let model = "inspection";
  let root = process.cwd();
  let tools = "repository";
  const objective: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--model" || argument === "--root" || argument === "--tools") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      if (argument === "--model") model = value;
      if (argument === "--root") root = value;
      if (argument === "--tools") tools = value;
      continue;
    }
    if (argument !== "--") {
      objective.push(argument ?? "");
    }
  }
  return { json, model, root, tools, objective: objective.join(" ").trim() };
}

const options = parseCliOptions(process.argv.slice(2));
const { objective } = options;
if (objective.length === 0) {
  process.stderr.write(
    "Usage: olympus [--model inspection|echo|uppercase] [--tools repository|fake] <objective>\n",
  );
  process.exitCode = 2;
} else {
  const model = options.model as ModelVariant;
  const tools = options.tools as ToolVariant;
  if (!["echo", "inspection", "uppercase"].includes(model)) {
    throw new Error(`Unknown model variant: ${model}`);
  }
  if (!["fake", "repository"].includes(tools)) {
    throw new Error(`Unknown tool variant: ${tools}`);
  }

  const thread = new InMemoryThread();
  const broker = new HostEffectBroker(new ReadOnlyPolicy(), thread);
  const olympus = new Olympus({
    audit: thread,
    hostServices: [hostService(EFFECT_BROKER, broker)],
  });

  try {
    await olympus.compose([
      createAthenaPlugin(),
      createToolPlugin(tools, options.root),
      createModelPlugin(model),
    ]);
    const result = await olympus.use(AGENT_RUNNER).run(objective);
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ result, events: thread.snapshot() }, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.answer}\n`);
    }
  } finally {
    await olympus.shutdown();
  }
}
