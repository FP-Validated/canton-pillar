-- Phase 0 Postgres extension provisioning.
-- See docs/Dev/Phase_00_Foundation.md ticket P0.A20.
-- Real migration management lands in Phase 03 (packages/db/migrations).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS partman;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
EXCEPTION
  WHEN undefined_file THEN
    RAISE NOTICE 'pg_partman extension is not available in this Postgres image; partitioned tables use normal table fallback until an image with pg_partman is deployed.';
END
$$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION migrator_advisory_lock_key() RETURNS bigint AS $$
BEGIN
  RETURN ('x' || substr(encode(digest('pillar_migration', 'sha256'), 'hex'), 1, 16))::bit(64)::bigint;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
