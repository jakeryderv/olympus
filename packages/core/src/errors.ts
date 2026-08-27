export class OlympusError extends Error {}

export class DuplicateCapabilityError extends OlympusError {
  constructor(capability: string) {
    super(`Capability is provided more than once: ${capability}`);
    this.name = "DuplicateCapabilityError";
  }
}

export class MissingCapabilityError extends OlympusError {
  constructor(capability: string) {
    super(`Required capability is missing: ${capability}`);
    this.name = "MissingCapabilityError";
  }
}

export class DependencyCycleError extends OlympusError {
  constructor(plugins: readonly string[]) {
    super(`Plugin dependency cycle detected: ${plugins.join(" -> ")}`);
    this.name = "DependencyCycleError";
  }
}

export class PluginSetupError extends OlympusError {
  readonly plugin: string;
  readonly cleanupErrors: readonly unknown[];

  constructor(plugin: string, cause: unknown, cleanupErrors: readonly unknown[]) {
    super(`Plugin setup failed: ${plugin}`, { cause });
    this.name = "PluginSetupError";
    this.plugin = plugin;
    this.cleanupErrors = cleanupErrors;
  }
}
