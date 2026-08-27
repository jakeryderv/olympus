/// <reference types="node" />

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "@olympus/contracts";
import * as CoreModule from "@olympus/core";
import {
  EFFECT_BROKER,
  HostEffectBroker,
  InMemoryThread,
  Olympus,
  type PluginSetupError,
  type PolicyEvaluator,
  ReadOnlyPolicy,
  hostService,
} from "@olympus/core";
import {
  DockerUnavailableError,
  SubprocessCancelledError,
  buildDockerRunArgs,
  createDockerToolPlugin,
  type DockerClient,
  type DockerInvocation,
  type ShellExecuteResult,
} from "../src/index.js";

interface ApprovalAuthorityLike {
  issue(scope: { readonly effect: string; readonly actor: string }): { readonly id: string };
}

// SAFETY: core exports these runtime classes; the casts bridge stale workspace declarations.
const ApprovalAuthority = (
  CoreModule as unknown as { ApprovalAuthority: new () => ApprovalAuthorityLike }
).ApprovalAuthority;
const ApprovalPolicy = (
  CoreModule as unknown as {
    ApprovalPolicy: new (
      authority: ApprovalAuthorityLike,
      fallback: PolicyEvaluator,
    ) => PolicyEvaluator;
  }
).ApprovalPolicy;

const image = `example.invalid/olympus@sha256:${"a".repeat(64)}`;
const roots: string[] = [];

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "olympus-docker-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class FakeDockerClient implements DockerClient {
  availableResult = true;
  readonly invocations: DockerInvocation[] = [];
  runImplementation: (
    invocation: DockerInvocation,
    signal?: AbortSignal,
  ) => Promise<ShellExecuteResult> = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
  async available(): Promise<boolean> {
    return this.availableResult;
  }
  run(invocation: DockerInvocation, signal?: AbortSignal): Promise<ShellExecuteResult> {
    this.invocations.push(invocation);
    return this.runImplementation(invocation, signal);
  }
}

async function compose(client: DockerClient, approvalId?: string, approved = false) {
  const thread = new InMemoryThread();
  const authority = new ApprovalAuthority();
  const policy = approved
    ? new ApprovalPolicy(authority, new ReadOnlyPolicy())
    : new ReadOnlyPolicy();
  const token = approved
    ? authority.issue({ effect: "shell.execute", actor: "athena" })
    : undefined;
  const broker = new HostEffectBroker(policy, thread);
  const olympus = new Olympus({
    audit: thread,
    hostServices: [hostService(EFFECT_BROKER, broker)],
  });
  const resolvedApprovalId = approvalId ?? token?.id;
  await olympus.compose([
    createDockerToolPlugin({
      image,
      workspaceRoot: await workspace(),
      client,
      ...(resolvedApprovalId === undefined ? {} : { approvalId: resolvedApprovalId }),
    }),
  ]);
  return { olympus, thread, token };
}

describe("Docker-isolated subprocess effects", () => {
  it("constructs a locked-down, digest-pinned Docker invocation", () => {
    const args = buildDockerRunArgs({
      containerName: "olympus-test",
      image,
      workspaceRoot: "/repo",
      workdir: "/workspace",
      argv: ["printf", "ok"],
      timeoutMs: 1000,
      maxOutputBytes: 4096,
    });
    expect(args).toContain("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("ALL");
    expect(args).toContain("no-new-privileges");
    expect(args).toContain("type=bind,src=/repo,dst=/workspace,readonly");
    expect(args).not.toContain("/var/run/docker.sock");
  });

  it("fails closed without Docker and without approval", async () => {
    const unavailable = new FakeDockerClient();
    unavailable.availableResult = false;
    const olympus = new Olympus({
      hostServices: [
        hostService(
          EFFECT_BROKER,
          new HostEffectBroker(new ReadOnlyPolicy(), new InMemoryThread()),
        ),
      ],
    });
    const activation = olympus.compose([
      createDockerToolPlugin({ image, workspaceRoot: await workspace(), client: unavailable }),
    ]);
    await expect(activation).rejects.toMatchObject({
      cause: expect.any(DockerUnavailableError),
    } satisfies Partial<PluginSetupError>);

    const client = new FakeDockerClient();
    const active = await compose(client);
    await expect(
      active.olympus
        .use(TOOL_CATALOG)
        .invoke({ name: "shell_execute", input: { argv: ["id"] } }, "athena", "c-1"),
    ).rejects.toThrow("Privileged effects are disabled");
    expect(client.invocations).toHaveLength(0);
    expect(active.thread.snapshot().map((event) => event.type)).toEqual([
      "effect.requested",
      "effect.denied",
    ]);
    await active.olympus.shutdown();
  });

  it("records authorization before execution and consumes approval once", async () => {
    const client = new FakeDockerClient();
    const active = await compose(client, undefined, true);
    client.runImplementation = async () => {
      expect(active.thread.snapshot().map((event) => event.type)).toEqual([
        "effect.requested",
        "effect.authorized",
        "effect.started",
      ]);
      return { exitCode: 0, stdout: "ok", stderr: "" };
    };
    const catalog = active.olympus.use(TOOL_CATALOG);
    await expect(
      catalog.invoke({ name: "shell_execute", input: { argv: ["printf", "ok"] } }, "athena", "c-2"),
    ).resolves.toMatchObject({ stdout: "ok" });
    await expect(
      catalog.invoke({ name: "shell_execute", input: { argv: ["id"] } }, "athena", "c-3"),
    ).rejects.toThrow("already used");
    expect(client.invocations).toHaveLength(1);
    await active.olympus.shutdown();
  });

  it("propagates cancellation and records a failed outcome", async () => {
    const client = new FakeDockerClient();
    client.runImplementation = async (_invocation, signal) =>
      new Promise((_resolve, reject) => {
        if (signal?.aborted === true) {
          reject(new SubprocessCancelledError());
          return;
        }
        signal?.addEventListener("abort", () => reject(new SubprocessCancelledError()), {
          once: true,
        });
      });
    const active = await compose(client, undefined, true);
    const controller = new AbortController();
    const catalog = active.olympus.use(TOOL_CATALOG);
    const execution = catalog.invoke(
      { name: "shell_execute", input: { argv: ["sleep", "60"] } },
      "athena",
      "c-4",
      controller.signal,
    );
    controller.abort();
    await expect(execution).rejects.toBeInstanceOf(SubprocessCancelledError);
    expect(active.thread.snapshot().at(-1)?.type).toBe("effect.failed");
    await active.olympus.shutdown();
  });
});
