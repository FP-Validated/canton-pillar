# Pillar API

Fastify implementation of the Pillar `/v1` public API contract.

## Run

```bash
pnpm --filter @pillar/api dev
pnpm --filter @pillar/api test
pnpm --filter @pillar/api build
```

Use `Authorization: Bearer plr_sk_test_demo` and include `Idempotency-Key` on mutating `POST` requests.

## Routes

The server exposes `/v1/health`, `/v1/openapi.json`, accounts, assets, balances, holdings, issue/redeem/transfer intents, holds, operations, events, webhook endpoints, and API keys. Phase 02 uses in-memory repositories and contract-shaped stub objects for projection-backed resources while preserving request IDs, API version echoing, idempotency, pagination, expand parsing, audit capture, and canonical error envelopes.
