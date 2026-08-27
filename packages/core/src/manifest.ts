import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import {
  DuplicatePluginManifestError,
  IncompatiblePluginManifestError,
  InvalidPluginConfigurationError,
  InvalidPluginManifestError,
  UnsupportedPluginTrustModeError,
} from "./errors.js";
import type { OlympusPlugin } from "./plugin.js";

export const PLUGIN_MANIFEST_API_VERSION = "olympus.dev/v1alpha1" as const;

export type PluginTrustMode = "trusted-in-process" | "isolated-subprocess";

export type JsonSchema = Readonly<object> | boolean;

export interface PluginManifest {
  readonly apiVersion: typeof PLUGIN_MANIFEST_API_VERSION;
  readonly id: string;
  readonly version: string;
  readonly trust: {
    readonly mode: PluginTrustMode;
  };
  readonly capabilities: {
    readonly requires: readonly string[];
    readonly provides: readonly string[];
  };
  readonly configuration: {
    readonly schema: JsonSchema;
  };
}

export const PLUGIN_MANIFEST_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://olympus.dev/schemas/plugin-manifest-v1alpha1.json",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "id", "version", "trust", "capabilities", "configuration"],
  properties: {
    apiVersion: { const: PLUGIN_MANIFEST_API_VERSION },
    id: {
      type: "string",
      pattern: "^[a-z][a-z0-9]*(?:[./_-][a-z0-9]+)*$",
      minLength: 3,
      maxLength: 128,
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$",
    },
    trust: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { enum: ["trusted-in-process", "isolated-subprocess"] },
      },
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      required: ["requires", "provides"],
      properties: {
        requires: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        provides: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
      },
    },
    configuration: {
      type: "object",
      additionalProperties: false,
      required: ["schema"],
      properties: {
        schema: { anyOf: [{ type: "object" }, { type: "boolean" }] },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateManifest = ajv.compile(PLUGIN_MANIFEST_SCHEMA);

function errorText(errors: readonly ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "validation failed";
  }
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

function capabilityNames(plugin: OlympusPlugin, kind: "requires" | "provides"): string[] {
  return [...(plugin[kind] ?? [])]
    .map((key) => key.name)
    .sort((left, right) => left.localeCompare(right));
}

function declaredCapabilityNames(plugin: OlympusPlugin, kind: "requires" | "provides"): string[] {
  return [...plugin.manifest.capabilities[kind]].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function configValidator(plugin: OlympusPlugin): ValidateFunction {
  try {
    return ajv.compile(plugin.manifest.configuration.schema);
  } catch (cause) {
    throw new InvalidPluginManifestError(
      plugin.manifest.id,
      `configuration schema is invalid${cause instanceof Error ? `: ${cause.message}` : ""}`,
    );
  }
}

export function assertPluginManifest(value: unknown): asserts value is PluginManifest {
  if (!validateManifest(value)) {
    const id =
      value !== null && typeof value === "object" && "id" in value && typeof value.id === "string"
        ? value.id
        : "<unknown>";
    throw new InvalidPluginManifestError(id, errorText(validateManifest.errors));
  }
}

export function validatePlugin(plugin: OlympusPlugin): void {
  assertPluginManifest(plugin.manifest);
  const id = plugin.manifest.id;
  if (plugin.name !== id) {
    throw new IncompatiblePluginManifestError(id, "manifest id does not match plugin name");
  }
  if (plugin.manifest.trust.mode !== "trusted-in-process") {
    throw new UnsupportedPluginTrustModeError(id, plugin.manifest.trust.mode);
  }

  for (const kind of ["requires", "provides"] as const) {
    const actual = capabilityNames(plugin, kind);
    const declared = declaredCapabilityNames(plugin, kind);
    if (!sameStrings(actual, declared)) {
      throw new IncompatiblePluginManifestError(
        id,
        `${kind} capabilities do not match runtime declarations`,
      );
    }
  }

  const validator = configValidator(plugin);
  if (!validator(plugin.config)) {
    throw new InvalidPluginConfigurationError(id, errorText(validator.errors));
  }
}

export function validatePluginSet(plugins: readonly OlympusPlugin[]): void {
  const identities = new Set<string>();
  for (const plugin of plugins) {
    validatePlugin(plugin);
    const id = plugin.manifest.id;
    if (identities.has(id)) {
      throw new DuplicatePluginManifestError(id);
    }
    identities.add(id);
  }
}
