-- ticket: P3.D08
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION migrator_advisory_lock_key() RETURNS bigint AS $$ BEGIN RETURN ('x' || substr(encode(digest('pillar_migration', 'sha256'), 'hex'), 1, 16))::bit(64)::bigint; END; $$ LANGUAGE plpgsql IMMUTABLE;
CREATE OR REPLACE FUNCTION raise_immutable_table_violation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable_table_violation'; END; $$ LANGUAGE plpgsql;

-- verify:
SELECT to_regproc('set_updated_at') IS NOT NULL AS ok;
SELECT to_regproc('migrator_advisory_lock_key') IS NOT NULL AS ok;
SELECT to_regproc('raise_immutable_table_violation') IS NOT NULL AS ok;
-- /verify
