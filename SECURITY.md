# Security Policy

## Supported versions

Olympus is pre-release software. Security fixes are applied to the latest commit on `main`; no stable release line is supported yet.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for `jakeryderv/olympus`. Do not open a public issue for suspected vulnerabilities or include secrets, exploit payloads, or private repository content in public reports.

Include the affected component, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Current security boundary

Olympus v0 trusts installed in-process plugin code. The host broker protects against model-requested privileged effects; it does not sandbox a malicious npm plugin from direct Node.js APIs. Shell commands, writes, network effects, and credential access are disabled. See [ADR 0001](docs/adr/0001-trust-and-enforcement-boundary.md).
