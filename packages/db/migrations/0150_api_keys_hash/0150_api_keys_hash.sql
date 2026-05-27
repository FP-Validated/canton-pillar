-- ticket: A3
-- owner: auth-hardening
-- forward-only: yes
ALTER TABLE IF EXISTS config.api_keys ADD COLUMN IF NOT EXISTS key_hash text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_uidx ON config.api_keys(key_hash);
-- verify:
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='config' AND table_name='api_keys' AND column_name='key_hash') AS ok;
SELECT to_regclass('config.api_keys_key_hash_uidx') IS NOT NULL AS ok;
-- /verify
