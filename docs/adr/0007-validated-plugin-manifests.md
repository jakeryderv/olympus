# ADR 0007: Validated plugin manifests and trust classification

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

Runtime capability objects alone do not provide package identity, compatibility metadata, a configuration contract, or an explicit trust classification. Loading third-party metadata without validation would let malformed or misleading declarations reach plugin setup.

## Decision

Every plugin carries an `olympus.dev/v1alpha1` manifest with:

- a stable ID and semantic version;
- an explicit `trusted-in-process` or `isolated-subprocess` trust mode;
- required and provided capability names;
- a JSON Schema Draft 7 contract for non-secret configuration.

The host validates every manifest and configuration with JSON Schema before dependency resolution or setup. It also checks that the compatibility `name` alias equals the manifest ID and that manifest capability names exactly match runtime service-key declarations. Invalid schemas, invalid configuration, duplicate IDs, and mismatched declarations fail closed before any plugin setup runs.

The v0 host activates only `trusted-in-process` plugins. `isolated-subprocess` is a valid classification but is rejected until an out-of-process loader and protocol exist. Marking a plugin isolated never causes it to execute in process. Credentials remain host services and must not be placed in plugin configuration.

## Alternatives

- Infer metadata from package names and runtime objects: rejected because trust and configuration would remain implicit.
- Accept arbitrary configuration and let setup validate it: rejected because earlier plugins might already be active when validation fails.
- Treat an `isolated-subprocess` label as sufficient isolation: rejected because labels are not enforcement.
- Add hot unload while changing the contract: deferred; shutdown remains whole-host reverse-order disposal.

## Consequences

Built-in plugins publish the same manifest contract expected of future ecosystem plugins. The manifest API is intentionally alpha and exact-versioned. An isolated loader can later consume the same validated metadata without weakening the current in-process trust boundary.
