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

export class InvalidPluginManifestError extends OlympusError {
  constructor(plugin: string, reason: string) {
    super(`Plugin manifest is invalid for ${plugin}: ${reason}`);
    this.name = "InvalidPluginManifestError";
  }
}

export class DuplicatePluginManifestError extends OlympusError {
  constructor(plugin: string) {
    super(`Plugin manifest identity is duplicated: ${plugin}`);
    this.name = "DuplicatePluginManifestError";
  }
}

export class IncompatiblePluginManifestError extends OlympusError {
  constructor(plugin: string, reason: string) {
    super(`Plugin manifest is incompatible for ${plugin}: ${reason}`);
    this.name = "IncompatiblePluginManifestError";
  }
}

export class InvalidPluginConfigurationError extends OlympusError {
  constructor(plugin: string, reason: string) {
    super(`Plugin configuration is invalid for ${plugin}: ${reason}`);
    this.name = "InvalidPluginConfigurationError";
  }
}

export class UnsupportedPluginTrustModeError extends OlympusError {
  constructor(plugin: string, mode: string) {
    super(`Plugin trust mode is not supported by the in-process host for ${plugin}: ${mode}`);
    this.name = "UnsupportedPluginTrustModeError";
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
