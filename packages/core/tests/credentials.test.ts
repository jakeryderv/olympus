import { describe, expect, it } from "vitest";
import { EnvironmentCredentialBroker, SecretValue } from "../src/index.js";

describe("host credential broker", () => {
  it("requires explicit reveal and redacts ordinary serialization", () => {
    const secret = new SecretValue("private-value");
    expect(secret.reveal()).toBe("private-value");
    expect(secret.toString()).toBe("[REDACTED]");
    expect(JSON.stringify(secret)).toBe('"[REDACTED]"');
  });

  it("fails closed when a required environment credential is absent", () => {
    const broker = new EnvironmentCredentialBroker({});
    expect(() => broker.get("OPENAI_API_KEY")).toThrow(
      "Required credential is unavailable: OPENAI_API_KEY",
    );
  });
});
