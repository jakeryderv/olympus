# Versioning Policy

Olympus libraries and the CLI follow [Semantic Versioning](https://semver.org/).

Before `1.0.0`, minor releases may change experimental APIs, but every breaking change must be documented in a Changeset. After `1.0.0`, changes to documented behavior, capability contracts, CLI flags, event schemas, or output formats require a major release.

Releases are prepared from Changesets and automated by GitHub Actions. Release notes and package versions must not be edited by hand outside that workflow.
