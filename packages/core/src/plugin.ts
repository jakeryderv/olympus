import type { PluginManifest } from "./manifest.js";
import type { Disposable, ServiceKey } from "./services.js";

export interface OlympusEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
}

export type EventHandler<T = unknown> = (event: OlympusEvent<T>) => void | Promise<void>;

export interface OlympusContext {
  provide<T>(key: ServiceKey<T>, value: T): Disposable;
  use<T>(key: ServiceKey<T>): T;
  has(key: ServiceKey<unknown>): boolean;
  on<T>(type: string, handler: EventHandler<T>): Disposable;
  emit<T>(type: string, payload: T): Promise<void>;
  defer(disposable: Disposable): void;
}

export interface OlympusPlugin {
  /** Compatibility alias; validation requires this to equal manifest.id. */
  readonly name: string;
  readonly manifest: PluginManifest;
  readonly config: unknown;
  readonly requires?: readonly ServiceKey<unknown>[];
  readonly provides?: readonly ServiceKey<unknown>[];
  setup(context: OlympusContext): void | Promise<void>;
}
