import { randomUUID } from "node:crypto";
import type { EffectMetadata, PolicyDecision, PolicyEvaluator } from "./effects.js";

const MAX_APPROVAL_TTL_MS = 5 * 60 * 1_000;

export interface ApprovalScope {
  readonly effect: string;
  readonly actor: string;
  readonly ttlMs?: number;
}

export interface ApprovalToken {
  readonly id: string;
  readonly effect: string;
  readonly actor: string;
  readonly expiresAt: string;
}

interface StoredApproval {
  readonly effect: string;
  readonly actor: string;
  readonly expiresAtMs: number;
}

export class ApprovalAuthority {
  readonly #approvals = new Map<string, StoredApproval>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  issue(scope: ApprovalScope): ApprovalToken {
    const ttlMs = scope.ttlMs ?? 60_000;
    if (
      scope.effect.length === 0 ||
      scope.actor.length === 0 ||
      !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 ||
      ttlMs > MAX_APPROVAL_TTL_MS
    ) {
      throw new Error("Approval scope or TTL is invalid.");
    }
    const id = randomUUID();
    const expiresAtMs = this.#now() + ttlMs;
    this.#approvals.set(id, {
      effect: scope.effect,
      actor: scope.actor,
      expiresAtMs,
    });
    return Object.freeze({
      id,
      effect: scope.effect,
      actor: scope.actor,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  }

  consume(id: string, request: Pick<EffectMetadata, "actor" | "effect">): PolicyDecision {
    const approval = this.#approvals.get(id);
    this.#approvals.delete(id);
    if (
      approval === undefined ||
      approval.expiresAtMs <= this.#now() ||
      approval.effect !== request.effect ||
      approval.actor !== request.actor
    ) {
      return {
        allowed: false,
        reason: "Approval token is invalid, expired, already used, or out of scope.",
      };
    }
    return { allowed: true, reason: "A scoped, single-use approval token was consumed." };
  }
}

export class ApprovalPolicy implements PolicyEvaluator {
  readonly #authority: ApprovalAuthority;
  readonly #fallback: PolicyEvaluator;

  constructor(authority: ApprovalAuthority, fallback: PolicyEvaluator) {
    this.#authority = authority;
    this.#fallback = fallback;
  }

  evaluate(request: EffectMetadata): PolicyDecision | Promise<PolicyDecision> {
    if (request.risk !== "privileged") {
      return this.#fallback.evaluate(request);
    }
    if (request.approvalId === undefined) {
      return { allowed: false, reason: "Privileged effects require a scoped approval token." };
    }
    return this.#authority.consume(request.approvalId, request);
  }
}
