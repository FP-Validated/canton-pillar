SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS += --no-print-directory

.DEFAULT_GOAL := help

.PHONY: help bootstrap daml-build codegen test dev-up dev-down lint format typecheck verify clean reset-ledger reset-db seed dpm-version-check

help:
	@echo "Pillar Make targets:"
	@echo "  bootstrap          - install Node, Gradle, Daml deps"
	@echo "  daml-build         - dpm build all Daml packages"
	@echo "  codegen            - run all codegen stubs"
	@echo "  test               - run pnpm test + gradle test (placeholders ok in P0)"
	@echo "  dev-up             - docker compose up local stack"
	@echo "  dev-down           - docker compose down local stack"
	@echo "  lint               - lint all workspaces"
	@echo "  format             - format all workspaces"
	@echo "  typecheck          - typecheck TS workspaces"
	@echo "  verify             - run P0 verify gate checks"
	@echo "  reset-ledger       - reset local sandbox ledger (dry-run by default)"
	@echo "  reset-db           - reset local Postgres (dry-run by default)"
	@echo "  seed               - seed local fixtures (no-op in P0)"
	@echo "  dpm-version-check  - verify installed Daml SDK/DPM matches pin"

bootstrap:
	@command -v pnpm >/dev/null || { echo "pnpm not installed; see .tool-versions" >&2; exit 1; }
	pnpm install
	@command -v ./gradlew >/dev/null && ./gradlew --no-daemon --quiet help || true
	@command -v dpm >/dev/null && dpm --version || echo "dpm not installed; daml-build will fail until installed"

daml-build:
	@command -v dpm >/dev/null || { echo "dpm not installed; see .tool-versions" >&2; exit 1; }
	cd daml && dpm build

codegen:
	bash tools/codegen/generate-all.sh

test:
	pnpm -w test
	./gradlew test --no-daemon || true

dev-up:
	docker compose -f infra/compose/local.yml up -d

dev-down:
	docker compose -f infra/compose/local.yml down

lint:
	pnpm -w lint || true
	pnpm exec prettier --check . --ignore-unknown

format:
	pnpm exec prettier --write . --ignore-unknown

typecheck:
	pnpm -w typecheck || true

verify:
	@echo "P0 verify gate"
	bash tools/dev/dpm-version-check.sh || true
	test -f package.json -a -f pnpm-workspace.yaml -a -f settings.gradle.kts -a -f daml/multi-package.yaml
	test -f Makefile -a -f .editorconfig -a -f CODEOWNERS -a -f SECURITY.md -a -f CONTRIBUTING.md -a -f LICENSE -a -f .tool-versions
	docker compose -f infra/compose/local.yml config >/dev/null

reset-ledger:
	bash tools/dev/reset-ledger.sh

reset-db:
	bash tools/dev/reset-db.sh

seed:
	bash tools/dev/seed.sh

dpm-version-check:
	bash tools/dev/dpm-version-check.sh

clean:
	rm -rf node_modules dist build .turbo target out .gradle .kotlin coverage
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +
