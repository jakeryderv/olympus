import { describe, expect, it } from "vitest";
import {
  DependencyCycleError,
  DuplicateCapabilityError,
  MissingCapabilityError,
  PLUGIN_MANIFEST_API_VERSION,
  PluginSetupError,
  serviceKey,
  type OlympusPlugin,
  type PluginManifest,
  type ServiceKey,
} from "../src/index.js";
import { Olympus } from "../src/olympus.js";

const A = serviceKey<string>("test.a");
const B = serviceKey<string>("test.b");

function manifest(
  id: string,
  requires: readonly ServiceKey<unknown>[] = [],
  provides: readonly ServiceKey<unknown>[] = [],
): PluginManifest {
  return {
    apiVersion: PLUGIN_MANIFEST_API_VERSION,
    id,
    version: "1.0.0",
    trust: { mode: "trusted-in-process" },
    capabilities: {
      requires: requires.map((key) => key.name),
      provides: provides.map((key) => key.name),
    },
    configuration: { schema: { type: "object", additionalProperties: false } },
  };
}

function provider(name: string, value: string): OlympusPlugin {
  return {
    name,
    manifest: manifest(name, [], [A]),
    config: {},
    provides: [A],
    setup(context) {
      context.provide(A, value);
    },
  };
}

describe("Olympus composition", () => {
  it("rejects missing and duplicate providers before setup", async () => {
    const missing: OlympusPlugin = {
      name: "missing",
      manifest: manifest("missing", [A]),
      config: {},
      requires: [A],
      setup() {},
    };
    await expect(new Olympus().compose([missing])).rejects.toBeInstanceOf(MissingCapabilityError);
    await expect(
      new Olympus().compose([provider("one", "1"), provider("two", "2")]),
    ).rejects.toBeInstanceOf(DuplicateCapabilityError);
  });

  it("rejects dependency cycles before setup", async () => {
    const left: OlympusPlugin = {
      name: "left",
      manifest: manifest("left", [B], [A]),
      config: {},
      requires: [B],
      provides: [A],
      setup(context) {
        context.provide(A, "left");
      },
    };
    const right: OlympusPlugin = {
      name: "right",
      manifest: manifest("right", [A], [B]),
      config: {},
      requires: [A],
      provides: [B],
      setup(context) {
        context.provide(B, "right");
      },
    };
    await expect(new Olympus().compose([left, right])).rejects.toBeInstanceOf(DependencyCycleError);
  });

  it("rolls back a failed composition and can activate cleanly afterward", async () => {
    const order: string[] = [];
    const rootCause = new Error("fault injection");
    const first: OlympusPlugin = {
      name: "first",
      manifest: manifest("first", [], [A]),
      config: {},
      provides: [A],
      setup(context) {
        context.provide(A, "active");
        context.defer({
          dispose: () => {
            order.push("first");
          },
        });
      },
    };
    const failing: OlympusPlugin = {
      name: "failing",
      manifest: manifest("failing", [A], [B]),
      config: {},
      requires: [A],
      provides: [B],
      setup(context) {
        context.provide(B, "partial");
        context.defer({
          dispose: () => {
            order.push("failing");
            throw new Error("cleanup fault");
          },
        });
        throw rootCause;
      },
    };

    let setupError: PluginSetupError | undefined;
    try {
      await new Olympus().compose([failing, first]);
    } catch (error) {
      setupError = error as PluginSetupError;
    }
    expect(setupError).toBeInstanceOf(PluginSetupError);
    expect(setupError?.cause).toBe(rootCause);
    expect(setupError?.cleanupErrors).toHaveLength(1);
    expect(order).toEqual(["failing", "first"]);

    const olympus = new Olympus();
    await olympus.compose([provider("clean", "ready")]);
    expect(olympus.use(A)).toBe("ready");
    await olympus.shutdown();
    expect(olympus.has(A)).toBe(false);
  });
});
