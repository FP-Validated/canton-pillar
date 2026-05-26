# Release tooling

Release automation lands in Phase 09. Phase 0 reserves the config surface so it can be wired without
moving files later.

Files:

- `release-please-config.json` — release-please monorepo config skeleton.
- `.release-please-manifest.json` — release-please version manifest (0.0.0 at P0).
- This README.

Phase 09 ticket `P9.J08` activates release-please (or Changesets, if substituted via ADR-supersession)
for real artifact publishing. Until then, this directory is reserved scaffolding.

## Why release-please

Per ADR alternatives review, release-please was chosen for monorepo bump tracking against conventional
commits. If ADR supersession swaps to Changesets, this directory will be relocated to `tools/release/`
under a new schema and the ADR will document the migration.

## Local usage

- Conventional Commits are enforced by `commitlint.config.cjs`.
- Manual entries are added to `CHANGELOG.md` until release-please takes over at P9.J08.
