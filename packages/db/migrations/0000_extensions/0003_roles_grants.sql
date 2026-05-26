-- ticket: P3.D30
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

-- Least-privilege service roles own no schema objects; grants are applied in later migrations after objects exist.
DO $$ BEGIN CREATE ROLE api LOGIN PASSWORD 'api'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE "ledger-command" LOGIN PASSWORD 'ledger-command'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE "projection-worker" LOGIN PASSWORD 'projection-worker'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE "webhook-dispatcher" LOGIN PASSWORD 'webhook-dispatcher'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE reconciler LOGIN PASSWORD 'reconciler'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO api, "ledger-command", "projection-worker", "webhook-dispatcher", reconciler;

-- verify:
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='api') AS ok;
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ledger-command') AS ok;
-- /verify
