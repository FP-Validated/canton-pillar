-- Phase 0 Postgres extension provisioning.
-- See docs/Dev/Phase_00_Foundation.md ticket P0.A20.
-- Real migration management lands in Phase 03 (packages/db/migrations).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_partman is reserved for monthly partitioning of large audit/usage tables
-- (see docs/Dev/Phase_14_Usage_Metering_Billing.md migration 0110_usage_metering).
-- It is NOT enabled in Phase 0 because the canonical Postgres image
-- (postgres:16-alpine) does not ship pg_partman by default. Enabling it requires
-- a Postgres image with pg_partman precompiled. Enabling deferred to Phase 14 or
-- when the image story is finalized in Phase 09.
-- CREATE EXTENSION IF NOT EXISTS pg_partman;
