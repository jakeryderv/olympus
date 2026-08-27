# Security Policy

## Supported versions

Olympus is pre-release software. Security fixes are applied to the latest commit on `main`; no stable release line is supported yet.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for `jakeryderv/olympus`. Do not open a public issue for suspected vulnerabilities or include secrets, exploit payloads, or private repository content in public reports.

Include the affected component, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Current security boundary

Olympus v0 trusts installed in-process plugin code. Validated manifests make trust classification explicit but do not create a sandbox; the in-process host rejects plugins marked for isolated execution. The host broker protects against model-requested privileged effects, but it does not sandbox a malicious npm plugin from direct Node.js APIs. Direct host shell commands, file writes, and model-requested network tools are disabled. The optional shell tool requires an explicit single-use approval and runs argv only in a locked-down, digest-pinned Docker container with a read-only workspace mount; it fails closed when Docker is unavailable. Model-provider credentials are released only through the host credential broker and must never appear in configuration, CLI arguments, logs, or Thread payloads. Provider adapters may make their documented API requests. See [ADR 0001](docs/adr/0001-trust-and-enforcement-boundary.md) and [ADR 0006](docs/adr/0006-credentials-and-model-provider-boundary.md).
