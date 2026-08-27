import { realpath, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  EFFECT_BROKER,
  type EffectBroker,
  type OlympusContext,
  type OlympusPlugin,
} from "@olympus/core";
import type {
  Oracle,
  OracleRequest,
  OracleResponse,
  ToolCall,
  ToolCatalog,
  ToolDefinition,
} from "@olympus/athena";
import { ORACLE, TOOL_CATALOG } from "@olympus/athena";

export type ModelVariant = "echo" | "inspection" | "uppercase";
export type ToolVariant = "fake" | "repository";

class ReferenceOracle implements Oracle {
  readonly #variant: ModelVariant;

  constructor(variant: ModelVariant) {
    this.#variant = variant;
  }

  async generate(request: OracleRequest): Promise<OracleResponse> {
    const metadata = { provider: "reference", model: this.#variant } as const;
    if (request.toolResult !== undefined) {
      return {
        message: `Tool result (${request.toolResult.name}): ${JSON.stringify(request.toolResult.output)}`,
        metadata,
      };
    }
    if (this.#variant === "echo") {
      return { message: `Echo: ${request.objective}`, metadata };
    }
    if (this.#variant === "uppercase") {
      return { message: request.objective.toUpperCase(), metadata };
    }
    const readMatch = /^read\s+(.+)$/i.exec(request.objective.trim());
    if (readMatch?.[1] !== undefined) {
      return {
        message: "Inspecting a file.",
        toolCall: { name: "read_file", input: { path: readMatch[1] } },
        metadata,
      };
    }
    if (/^list(?:\s+files)?$/i.test(request.objective.trim())) {
      return {
        message: "Listing repository files.",
        toolCall: { name: "list_files", input: { path: "." } },
        metadata,
      };
    }
    return {
      message: "The deterministic inspection model supports `list` and `read <path>`.",
      metadata,
    };
  }
}

export function createModelPlugin(variant: ModelVariant): OlympusPlugin {
  const config = { variant };
  const name = `delphi/reference-${variant}`;
  const plugin = {
    name,
    manifest: {
      apiVersion: "olympus.dev/v1alpha1" as const,
      id: name,
      version: "0.1.0",
      trust: { mode: "trusted-in-process" as const },
      capabilities: { requires: [], provides: [ORACLE.name] },
      configuration: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["variant"],
          properties: { variant: { enum: ["echo", "uppercase", "inspection"] } },
        },
      },
    },
    config,
    provides: [ORACLE],
    setup(context: OlympusContext) {
      context.provide(ORACLE, new ReferenceOracle(config.variant));
    },
  };
  return plugin;
}

interface PathInput {
  readonly path: string;
}

const pathInputSchema = {
  type: "object",
  properties: { path: { type: "string" } },
  required: ["path"],
  additionalProperties: false,
} as const;

const definitions: readonly ToolDefinition[] = [
  {
    name: "list_files",
    description: "List entries inside the configured repository root.",
    inputSchema: pathInputSchema,
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file inside the configured repository root.",
    inputSchema: pathInputSchema,
  },
];

class BrokeredToolCatalog implements ToolCatalog {
  readonly #broker: EffectBroker;
  readonly #prefix: string;

  constructor(broker: EffectBroker, prefix: string) {
    this.#broker = broker;
    this.#prefix = prefix;
  }

  definitions(): readonly ToolDefinition[] {
    return definitions;
  }

  invoke(call: ToolCall, actor: string, correlationId: string): Promise<unknown> {
    if (!definitions.some((definition) => definition.name === call.name)) {
      return Promise.reject(new Error(`Unknown tool: ${call.name}`));
    }
    return this.#broker.execute({
      effect: `${this.#prefix}.${call.name}`,
      input: call.input,
      actor,
      correlationId,
    });
  }
}

function parsePathInput(input: unknown): PathInput {
  if (
    input === null ||
    typeof input !== "object" ||
    !("path" in input) ||
    typeof input.path !== "string"
  ) {
    throw new Error("Tool input must contain a string path.");
  }
  return { path: input.path };
}

async function confinedPath(root: string, requestedPath: string): Promise<string> {
  const candidate = await realpath(resolve(root, requestedPath));
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("Path escapes the configured repository root.");
  }
  return candidate;
}

export function createToolPlugin(variant: ToolVariant, repositoryRoot: string): OlympusPlugin {
  const config = { variant, repositoryRoot };
  const prefix = `hermes.${config.variant}`;
  const name = `${prefix}-tools`;
  const plugin = {
    name,
    manifest: {
      apiVersion: "olympus.dev/v1alpha1" as const,
      id: name,
      version: "0.1.0",
      trust: { mode: "trusted-in-process" as const },
      capabilities: {
        requires: [EFFECT_BROKER.name],
        provides: [TOOL_CATALOG.name],
      },
      configuration: {
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["variant", "repositoryRoot"],
          properties: {
            variant: { enum: ["fake", "repository"] },
            repositoryRoot: { type: "string", minLength: 1 },
          },
        },
      },
    },
    config,
    requires: [EFFECT_BROKER],
    provides: [TOOL_CATALOG],
    async setup(context: OlympusContext) {
      const broker = context.use(EFFECT_BROKER);
      if (config.variant === "fake") {
        context.defer(broker.register(`${prefix}.list_files`, "read", () => ["README.md"]));
        context.defer(
          broker.register(`${prefix}.read_file`, "read", (input: unknown) => ({
            path: parsePathInput(input).path,
            content: "deterministic fixture",
          })),
        );
      } else {
        const root = await realpath(config.repositoryRoot);
        context.defer(
          broker.register(`${prefix}.list_files`, "read", async (input: unknown) => {
            const directory = await confinedPath(root, parsePathInput(input).path);
            const entries = await readdir(directory, { withFileTypes: true });
            return entries
              .map((entry) => ({
                name: entry.name,
                kind: entry.isDirectory() ? "directory" : "file",
              }))
              .sort((left, right) => left.name.localeCompare(right.name));
          }),
        );
        context.defer(
          broker.register(`${prefix}.read_file`, "read", async (input: unknown) => {
            const path = await confinedPath(root, parsePathInput(input).path);
            const metadata = await stat(path);
            if (!metadata.isFile()) {
              throw new Error("Requested path is not a file.");
            }
            if (metadata.size > 65_536) {
              throw new Error("File exceeds the v0 read limit of 64 KiB.");
            }
            return { path: relative(root, path), content: await readFile(path, "utf8") };
          }),
        );
      }
      context.provide(TOOL_CATALOG, new BrokeredToolCatalog(broker, prefix));
    },
  };
  return plugin;
}
