import { describe, expect, it } from "vitest";
import { HostEffectBroker, InMemoryThread, ReadOnlyPolicy } from "../src/index.js";

describe("Thread audit events", () => {
  it("assigns stable sequence metadata and redacts sensitive fields", () => {
    const thread = new InMemoryThread("00000000-0000-4000-8000-000000000001");
    thread.append({
      type: "example",
      actor: "test",
      correlationId: "correlation-1",
      payload: { token: "do-not-store", nested: { password: "also-secret", safe: "visible" } },
    });
    thread.append({ type: "second", actor: "test", payload: {} });

    const events = thread.snapshot();
    expect(events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(events[0]?.threadId).toBe("00000000-0000-4000-8000-000000000001");
    expect(events[0]?.payload).toEqual({
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", safe: "visible" },
    });
  });

  it("denies privileged effects in the v0 host policy", async () => {
    const thread = new InMemoryThread("00000000-0000-4000-8000-000000000002");
    const broker = new HostEffectBroker(new ReadOnlyPolicy(), thread);
    broker.register("shell.execute", "privileged", () => "should not run");

    await expect(
      broker.execute({ effect: "shell.execute", input: {}, actor: "athena" }),
    ).rejects.toThrow("Privileged effects are disabled");
    expect(thread.snapshot().map((event) => event.type)).toEqual([
      "effect.requested",
      "effect.denied",
    ]);
  });
});
