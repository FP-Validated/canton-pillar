# Contributing to Canton Pillar

Canton Pillar is a Canton-native runtime for Stripe-grade asset APIs; contributions must preserve the ledger-of-truth model, Stripe-like external grammar, and Canton-invisible product experience.

Pillar is built phase-by-phase. See `docs/Dev/README.md` and `docs/Dev/PARALLELIZATION_PLAN.md`.

## Workflow

1. Pick a ticket from the owning phase doc (`docs/Dev/Phase_NN_*.md`).
2. Branch: `git checkout -b ticket/P<phase>.<area-letter><nn>-<slug>` (e.g. `ticket/P3.D03-idempotency-package`).
3. Implement against the ticket's `Path`, `Output`, `Deps`, and `Acceptance`.
4. Verify locally:
   - `make lint`
   - `make format`
   - `make test`
   - phase-specific build/verify commands
5. Open a PR. Title format follows Conventional Commits (`feat(scope): summary`).
6. PR description references the ticket ID and the phase doc.

## Commit messages

Conventional Commits, validated by `commitlint`. Examples:

- `feat(api): add /v1/accounts CRUD-lite (P2.E04)`
- `fix(ledger-command): preserve command_id on retry (P4.F04)`
- `chore(ci): pin Daml SDK to 3.4.11 (P0.A18)`

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.

## Ticket ID convention

`P<phase>.<area-letter><nn>` where area letters are documented in `docs/Dev/README.md` §4 and `local://pillar-expansion-shared.md`.

NEVER invent new area letters without an ADR.

## Code review

- Two reviews required for production-path code.
- One review acceptable for docs, runbooks, and scaffolding tickets in P0.
- See `CODEOWNERS` for routing.

## Local bootstrap

```
make bootstrap
make dev-up
```

Requires Node 20.18.0, pnpm 9.12.3, JDK 21, Gradle 8.10.2, Daml SDK 3.4.11, Docker. See `.tool-versions` and `local://pillar-p0-impl-shared.md` for exact pins.

## Non-secret policy

- NEVER commit `.env` (only `.env.example` with fake values).
- NEVER commit production API keys, JWT secrets, mTLS material, or KMS references.
- See `SECURITY.md`.
- See `docs/Dev/REGRESSION_CONTRACT.md` §10.

## Architecture invariants

Before opening a PR, re-read `docs/Dev/REGRESSION_CONTRACT.md`. Any change that would violate IC-01..IC-10 requires a superseding ADR in `docs/Dev/DECISIONS.md`.
