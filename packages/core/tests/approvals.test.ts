import { describe, expect, it } from "vitest";
import { ApprovalAuthority, ApprovalPolicy, ReadOnlyPolicy } from "../src/index.js";

describe("privileged effect approvals", () => {
  it("scopes tokens by effect and actor and consumes them once", async () => {
    let now = 1_000;
    const authority = new ApprovalAuthority(() => now);
    const policy = new ApprovalPolicy(authority, new ReadOnlyPolicy());
    const token = authority.issue({ effect: "shell.execute", actor: "athena", ttlMs: 1_000 });
    expect(
      policy.evaluate({
        effect: "shell.execute",
        risk: "privileged",
        actor: "athena",
        approvalId: token.id,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      policy.evaluate({
        effect: "shell.execute",
        risk: "privileged",
        actor: "athena",
        approvalId: token.id,
      }),
    ).toMatchObject({ allowed: false });

    const expired = authority.issue({ effect: "shell.execute", actor: "athena", ttlMs: 1_000 });
    now += 1_000;
    expect(
      policy.evaluate({
        effect: "shell.execute",
        risk: "privileged",
        actor: "athena",
        approvalId: expired.id,
      }),
    ).toMatchObject({ allowed: false });
  });

  it("does not let approval policy weaken default read-only behavior", async () => {
    const policy = new ApprovalPolicy(new ApprovalAuthority(), new ReadOnlyPolicy());
    expect(
      policy.evaluate({ effect: "shell.execute", risk: "privileged", actor: "athena" }),
    ).toMatchObject({ allowed: false });
    expect(policy.evaluate({ effect: "repo.read", risk: "read", actor: "athena" })).toMatchObject({
      allowed: true,
    });
  });
});
