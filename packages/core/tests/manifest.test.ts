import { describe, expect, it } from "vitest";
import {
  DuplicatePluginManifestError,
  IncompatiblePluginManifestError,
  InvalidPluginConfigurationError,
  InvalidPluginManifestError,
  Olympus,
  PLUGIN_MANIFEST_API_VERSION,
  UnsupportedPluginTrustModeError,
  serviceKey,
  type JsonSchema,
  type OlympusPlugin,
  type PluginTrustMode,
} from "../src/index.js";

const EXAMPLE = serviceKey<string>("example.capability");

interface TestPluginOptions {
  readonly name?: string;
  readonly version?: string;
  readonly trust?: PluginTrustMode;
  readonly schema?: JsonSchema;
  readonly config?: unknown;
  readonly manifestProvides?: readonly string[];
  readonly runtimeProvides?: (typeof EXAMPLE)[];
  readonly onSetup?: () => void;
}

function testPlugin(options: TestPluginOptions = {}): OlympusPlugin {
  const name = options.name ?? "example/plugin";
  return {
    name,
    manifest: {
      apiVersion: PLUGIN_MANIFEST_API_VERSION,
      id: name,
      version: options.version ?? "1.0.0",
      trust: { mode: options.trust ?? "trusted-in-process" },
      capabilities: {
        requires: [],
        provides: options.manifestProvides ?? [],
      },
      configuration: {
        schema: options.schema ?? { type: "object", additionalProperties: false },
      },
    },
    config: options.config ?? {},
    ...(options.runtimeProvides === undefined ? {} : { provides: options.runtimeProvides }),
    setup(context) {
      options.onSetup?.();
      if (options.runtimeProvides?.includes(EXAMPLE) === true) {
        context.provide(EXAMPLE, "ready");
      }
    },
  };
}

describe("plugin manifests", () => {
  it("validates configuration before setup", async () => {
    let setups = 0;
    const plugin = testPlugin({
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["enabled"],
        properties: { enabled: { type: "boolean" } },
      },
      config: { enabled: "yes" },
      onSetup: () => {
        setups += 1;
      },
    });

    await expect(new Olympus().compose([plugin])).rejects.toBeInstanceOf(
      InvalidPluginConfigurationError,
    );
    expect(setups).toBe(0);
  });

  it("rejects malformed, duplicate, and incompatible manifests before setup", async () => {
    let setups = 0;
    const invalid = testPlugin({
      name: "Invalid Plugin ID",
      onSetup: () => {
        setups += 1;
      },
    });
    await expect(new Olympus().compose([invalid])).rejects.toBeInstanceOf(
      InvalidPluginManifestError,
    );
    const invalidVersion = testPlugin({ version: "latest" });
    await expect(new Olympus().compose([invalidVersion])).rejects.toBeInstanceOf(
      InvalidPluginManifestError,
    );

    const duplicate = testPlugin({
      onSetup: () => {
        setups += 1;
      },
    });
    await expect(new Olympus().compose([duplicate, duplicate])).rejects.toBeInstanceOf(
      DuplicatePluginManifestError,
    );

    const incompatible = testPlugin({
      runtimeProvides: [EXAMPLE],
      onSetup: () => {
        setups += 1;
      },
    });
    await expect(new Olympus().compose([incompatible])).rejects.toBeInstanceOf(
      IncompatiblePluginManifestError,
    );
    expect(setups).toBe(0);
  });

  it("rejects isolated plugins until an out-of-process loader exists", async () => {
    const isolated = testPlugin({ trust: "isolated-subprocess" });
    await expect(new Olympus().compose([isolated])).rejects.toBeInstanceOf(
      UnsupportedPluginTrustModeError,
    );
  });

  it("rejects invalid configuration schemas and accepts a compatible plugin", async () => {
    const invalidSchema = testPlugin({ schema: { type: "not-a-json-schema-type" } });
    await expect(new Olympus().compose([invalidSchema])).rejects.toBeInstanceOf(
      InvalidPluginManifestError,
    );

    const compatible = testPlugin({
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: { label: { type: "string", minLength: 1 } },
      },
      config: { label: "ready" },
      manifestProvides: [EXAMPLE.name],
      runtimeProvides: [EXAMPLE],
    });
    const olympus = new Olympus();
    await olympus.compose([compatible]);
    expect(olympus.use(EXAMPLE)).toBe("ready");
    await olympus.shutdown();
  });
});
