import { randomUUID } from "node:crypto";
import type { AuditSink } from "./thread.js";
import type { Disposable } from "./services.js";
import { serviceKey } from "./services.js";

export type EffectRisk = "read" | "privileged";

export interface EffectRequest<T = unknown> {
  readonly effect: string;
  readonly input: T;
  readonly actor: string;
  readonly correlationId?: string;
  readonly approvalId?: string;
  readonly signal?: AbortSignal;
}

export interface EffectExecutionContext {
  readonly correlationId: string;
  readonly signal?: AbortSignal;
}

export interface EffectMetadata {
  readonly effect: string;
  readonly risk: EffectRisk;
  readonly actor: string;
  readonly approvalId?: string;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export interface PolicyEvaluator {
  evaluate(request: EffectMetadata): PolicyDecision | Promise<PolicyDecision>;
}

export interface EffectBroker {
  register<I, O>(
    effect: string,
    risk: EffectRisk,
    handler: (input: I, context: EffectExecutionContext) => O | Promise<O>,
  ): Disposable;
  execute<I, O>(request: EffectRequest<I>): Promise<O>;
}

export const EFFECT_BROKER = serviceKey<EffectBroker>("olympus.host.effect-broker");

export class ReadOnlyPolicy implements PolicyEvaluator {
  evaluate(request: EffectMetadata): PolicyDecision {
    return request.risk === "read"
      ? { allowed: true, reason: "Read-only effects are allowed in v0." }
      : { allowed: false, reason: "Privileged effects are disabled in v0." };
  }
}

interface RegisteredEffect {
  readonly risk: EffectRisk;
  readonly handler: (input: unknown, context: EffectExecutionContext) => unknown | Promise<unknown>;
}

export class HostEffectBroker implements EffectBroker {
  readonly #effects = new Map<string, RegisteredEffect>();
  readonly #policy: PolicyEvaluator;
  readonly #audit: AuditSink;

  constructor(policy: PolicyEvaluator, audit: AuditSink) {
    this.#policy = policy;
    this.#audit = audit;
  }

  register<I, O>(
    effect: string,
    risk: EffectRisk,
    handler: (input: I, context: EffectExecutionContext) => O | Promise<O>,
  ): Disposable {
    if (this.#effects.has(effect)) {
      throw new Error(`Effect is already registered: ${effect}`);
    }
    const registration: RegisteredEffect = {
      risk,
      handler: (input, context) => handler(input as I, context),
    };
    this.#effects.set(effect, registration);
    return {
      dispose: () => {
        if (this.#effects.get(effect) === registration) {
          this.#effects.delete(effect);
        }
      },
    };
  }

  async execute<I, O>(request: EffectRequest<I>): Promise<O> {
    const registration = this.#effects.get(request.effect);
    if (registration === undefined) {
      throw new Error(`Unknown effect: ${request.effect}`);
    }
    const correlationId = request.correlationId ?? randomUUID();
    this.#audit.append({
      type: "effect.requested",
      actor: request.actor,
      correlationId,
      payload: {
        effect: request.effect,
        risk: registration.risk,
        ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
      },
    });
    const decision = await this.#policy.evaluate({
      effect: request.effect,
      risk: registration.risk,
      actor: request.actor,
      ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
    });
    this.#audit.append({
      type: decision.allowed ? "effect.authorized" : "effect.denied",
      actor: "olympus.host",
      correlationId,
      payload: {
        effect: request.effect,
        reason: decision.reason,
        ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
      },
    });
    if (!decision.allowed) {
      throw new Error(`Effect denied: ${decision.reason}`);
    }
    this.#audit.append({
      type: "effect.started",
      actor: "olympus.host",
      correlationId,
      payload: { effect: request.effect },
    });
    try {
      const output = await registration.handler(request.input, {
        correlationId,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      this.#audit.append({
        type: "effect.completed",
        actor: "olympus.host",
        correlationId,
        payload: { effect: request.effect },
      });
      return output as O;
    } catch (error) {
      this.#audit.append({
        type: "effect.failed",
        actor: "olympus.host",
        correlationId,
        payload: {
          effect: request.effect,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      throw error;
    }
  }
}
