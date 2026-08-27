import { describe, expect, it } from "vitest";
import {
  DependencyCycleError,
  DuplicateCapabilityError,
  MissingCapabilityError,
  PluginSetupError,
  serviceKey,
  type OlympusPlugin,
} from "../src/index.js";
import { Olympus } from "../src/olympus.js";

const A = serviceKey<string>("test.a");
const B = serviceKey<string>("test.b");

function provider(name: string, value: string): OlympusPlugin {
  return {
    name,
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
      requires: [B],
      provides: [A],
      setup(context) {
        context.provide(A, "left");
      },
    };
    const right: OlympusPlugin = {
      name: "right",
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
