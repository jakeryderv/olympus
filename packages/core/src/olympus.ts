import {
  DependencyCycleError,
  DuplicateCapabilityError,
  MissingCapabilityError,
  PluginSetupError,
} from "./errors.js";
import type { EventHandler, OlympusContext, OlympusEvent, OlympusPlugin } from "./plugin.js";
import { validatePluginSet } from "./manifest.js";
import type { Disposable, HostService, ServiceKey } from "./services.js";
import { InMemoryThread, type AuditSink } from "./thread.js";

interface ServiceEntry {
  readonly key: ServiceKey<unknown>;
  readonly value: unknown;
  readonly owner: string | null;
}

interface ActivePlugin {
  readonly plugin: OlympusPlugin;
  readonly disposables: readonly Disposable[];
}

export interface OlympusOptions {
  readonly audit?: AuditSink;
  readonly hostServices?: readonly HostService[];
}

function asUnknownKey<T>(key: ServiceKey<T>): ServiceKey<unknown> {
  return key as ServiceKey<unknown>;
}

function correlationIdOf(payload: unknown): string | undefined {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "correlationId" in payload &&
    typeof payload.correlationId === "string"
  ) {
    return payload.correlationId;
  }
  return undefined;
}

function once(dispose: () => void | Promise<void>): Disposable {
  let disposed = false;
  return {
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      await dispose();
    },
  };
}

export class Olympus {
  readonly #services = new Map<symbol, ServiceEntry>();
  readonly #handlers = new Map<string, Set<EventHandler<unknown>>>();
  readonly #active: ActivePlugin[] = [];
  readonly #audit: AuditSink;
  #composing = false;

  constructor(options: OlympusOptions = {}) {
    this.#audit = options.audit ?? new InMemoryThread();
    for (const service of options.hostServices ?? []) {
      if (this.#services.has(service.key.id)) {
        throw new DuplicateCapabilityError(service.key.name);
      }
      this.#services.set(service.key.id, {
        key: asUnknownKey(service.key),
        value: service.value,
        owner: null,
      });
    }
  }

  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.id);
  }

  use<T>(key: ServiceKey<T>): T {
    const entry = this.#services.get(key.id);
    if (entry === undefined) {
      throw new MissingCapabilityError(key.name);
    }
    return entry.value as T;
  }

  async emit<T>(type: string, payload: T, actor = "olympus.host"): Promise<void> {
    const correlationId = correlationIdOf(payload);
    this.#audit.append({
      type,
      payload,
      actor,
      ...(correlationId === undefined ? {} : { correlationId }),
    });
    const handlers = [...(this.#handlers.get(type) ?? [])];
    await Promise.all(
      handlers.map((handler) => handler({ type, payload } as OlympusEvent<unknown>)),
    );
  }

  async compose(plugins: readonly OlympusPlugin[]): Promise<void> {
    if (this.#composing) {
      throw new Error("Plugin composition is already in progress.");
    }
    this.#composing = true;
    const baseline = this.#active.length;
    try {
      validatePluginSet([...this.#active.map((record) => record.plugin), ...plugins]);
      const ordered = this.#resolveOrder(plugins);
      for (const plugin of ordered) {
        await this.#activate(plugin, baseline);
      }
    } finally {
      this.#composing = false;
    }
  }

  async shutdown(): Promise<void> {
    const active = this.#active.splice(0).toReversed();
    const errors: unknown[] = [];
    for (const record of active) {
      errors.push(...(await this.#disposeAll(record.disposables)));
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Olympus shutdown completed with cleanup errors.");
    }
  }

  #resolveOrder(plugins: readonly OlympusPlugin[]): readonly OlympusPlugin[] {
    const providers = this.#indexProviders(plugins);
    const dependencies = this.#buildDependencyGraph(plugins, providers);
    return this.#topologicalOrder(plugins, dependencies);
  }

  #indexProviders(plugins: readonly OlympusPlugin[]): Map<symbol, OlympusPlugin> {
    const names = new Set<string>();
    const providers = new Map<symbol, OlympusPlugin>();
    for (const plugin of plugins) {
      const pluginId = plugin.manifest.id;
      if (names.has(pluginId)) {
        throw new Error(`Plugin name is duplicated: ${pluginId}`);
      }
      names.add(pluginId);
      for (const key of plugin.provides ?? []) {
        if (this.#services.has(key.id) || providers.has(key.id)) {
          throw new DuplicateCapabilityError(key.name);
        }
        providers.set(key.id, plugin);
      }
    }
    return providers;
  }

  #buildDependencyGraph(
    plugins: readonly OlympusPlugin[],
    providers: ReadonlyMap<symbol, OlympusPlugin>,
  ): Map<OlympusPlugin, Set<OlympusPlugin>> {
    const dependencies = new Map<OlympusPlugin, Set<OlympusPlugin>>();
    for (const plugin of plugins) {
      const requiredPlugins = new Set<OlympusPlugin>();
      for (const key of plugin.requires ?? []) {
        if (this.#services.has(key.id)) {
          continue;
        }
        const provider = providers.get(key.id);
        if (provider === undefined) {
          throw new MissingCapabilityError(key.name);
        }
        if (provider !== plugin) {
          requiredPlugins.add(provider);
        }
      }
      dependencies.set(plugin, requiredPlugins);
    }
    return dependencies;
  }

  #topologicalOrder(
    plugins: readonly OlympusPlugin[],
    dependencies: ReadonlyMap<OlympusPlugin, ReadonlySet<OlympusPlugin>>,
  ): readonly OlympusPlugin[] {
    const remaining = new Set(plugins);
    const ordered: OlympusPlugin[] = [];
    while (remaining.size > 0) {
      const ready = plugins.filter(
        (plugin) =>
          remaining.has(plugin) &&
          [...(dependencies.get(plugin) ?? [])].every((item) => !remaining.has(item)),
      );
      if (ready.length === 0) {
        throw new DependencyCycleError([...remaining].map((plugin) => plugin.manifest.id));
      }
      for (const plugin of ready) {
        remaining.delete(plugin);
        ordered.push(plugin);
      }
    }
    return ordered;
  }

  async #activate(plugin: OlympusPlugin, baseline: number): Promise<void> {
    const disposables: Disposable[] = [];
    const pluginId = plugin.manifest.id;
    const context = this.#contextFor(pluginId, disposables);
    try {
      await plugin.setup(context);
      for (const key of plugin.provides ?? []) {
        const entry = this.#services.get(key.id);
        if (entry?.owner !== pluginId) {
          throw new MissingCapabilityError(`${key.name} (declared by ${pluginId})`);
        }
      }
      this.#active.push({ plugin, disposables });
    } catch (cause) {
      const cleanupErrors = await this.#disposeAll(disposables);
      const newlyActive = this.#active.splice(baseline).toReversed();
      for (const record of newlyActive) {
        cleanupErrors.push(...(await this.#disposeAll(record.disposables)));
      }
      throw new PluginSetupError(pluginId, cause, cleanupErrors);
    }
  }

  #contextFor(pluginName: string, disposables: Disposable[]): OlympusContext {
    return {
      provide: <T>(key: ServiceKey<T>, value: T): Disposable => {
        if (this.#services.has(key.id)) {
          throw new DuplicateCapabilityError(key.name);
        }
        const entry: ServiceEntry = {
          key: asUnknownKey(key),
          value,
          owner: pluginName,
        };
        this.#services.set(key.id, entry);
        const disposable = once(() => {
          if (this.#services.get(key.id) === entry) {
            this.#services.delete(key.id);
          }
        });
        disposables.push(disposable);
        return disposable;
      },
      use: <T>(key: ServiceKey<T>): T => this.use(key),
      has: (key: ServiceKey<unknown>): boolean => this.has(key),
      on: <T>(type: string, handler: EventHandler<T>): Disposable => {
        const handlers = this.#handlers.get(type) ?? new Set<EventHandler<unknown>>();
        this.#handlers.set(type, handlers);
        const stored = handler as EventHandler<unknown>;
        handlers.add(stored);
        const disposable = once(() => {
          handlers.delete(stored);
          if (handlers.size === 0) {
            this.#handlers.delete(type);
          }
        });
        disposables.push(disposable);
        return disposable;
      },
      emit: <T>(type: string, payload: T): Promise<void> => this.emit(type, payload, pluginName),
      defer: (disposable: Disposable): void => {
        disposables.push(once(() => disposable.dispose()));
      },
    };
  }

  async #disposeAll(disposables: readonly Disposable[]): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const disposable of disposables.toReversed()) {
      try {
        await disposable.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}
