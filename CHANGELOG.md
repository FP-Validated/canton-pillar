# Changelog

All notable changes to Pillar are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
API versions follow Stripe-style date-pinned versioning per `docs/Dev/RELEASE_PLAN.md`.

## [Unreleased]

### Added

- Initial Phase 0 repository scaffold: pnpm + Gradle + Daml multi-package workspaces.
- Phase 0 policy files: CODEOWNERS, SECURITY.md, CONTRIBUTING.md, LICENSE placeholder.
- Phase 0 toolchain pins: Node 20.18, pnpm 9.12.3, JDK 21, Gradle 8.10.2, Daml 3.5.0.
- Local compose stack scaffold: Postgres, Redis, Canton sandbox, webhook receiver, migrator stub, OpenTelemetry collector.
- CI skeleton workflows: workspace lint/test and Daml build.

### Notes

This project is pre-1.0 and pre-release. Public release will retag the first stable version per `docs/Dev/RELEASE_PLAN.md`.
