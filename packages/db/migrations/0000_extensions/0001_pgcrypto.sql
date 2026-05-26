-- ticket: P3.D08
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS partman;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_partman') THEN
    CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
  ELSE
    RAISE NOTICE 'pg_partman unavailable; using non-partitioned fallback';
  END IF;
END;
$$;

-- verify:
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS ok;
SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='citext') AS ok;
-- /verify
