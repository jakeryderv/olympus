# ADR 0006: Credentials and model-provider boundary

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The first real model adapter needs an API credential, streaming, cancellation, tool calls, usage data, and provider errors. Provider SDK types and secrets must not leak into Athena, core event payloads, or persisted Threads.

## Decision

Olympus exposes a host-owned `CredentialBroker` service. The composition root supplies environment-backed credentials, and provider plugins request a named `SecretValue` during setup. `SecretValue` serializes and renders as `[REDACTED]`; only an explicit `reveal()` call returns the value.

The OpenAI adapter uses the official Responses API SDK. It maps SDK responses into provider-neutral Oracle text, tool calls, continuation tokens, request metadata, token usage, streaming events, cancellation, and `OracleError` categories. Athena and core do not import OpenAI types.

Responses use `store: false`. Tool-call continuation state is encoded locally as an opaque token and replayed with function-call output, rather than relying on remotely stored response state. CI uses fake transports and never requires a live credential.

## Alternatives

- Let the plugin read `process.env` directly: rejected because credential release belongs to the host boundary.
- Put the API key in plugin configuration: rejected because configuration and audit events are inspectable.
- Expose OpenAI SDK response objects through Oracle: rejected because it couples Athena to one provider.
- Run live paid model calls in CI: rejected in favor of deterministic transport tests and opt-in manual use.

## Consequences

The CLI supports `--model openai`, reads `OPENAI_API_KEY` through the host broker, and accepts `--openai-model` or `OPENAI_MODEL`. SDK upgrades are isolated to `@olympus/openai`. Future providers must map into the same Oracle contracts and error taxonomy.
