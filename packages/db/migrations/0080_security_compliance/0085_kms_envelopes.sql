-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE TABLE IF NOT EXISTS config.kms_envelopes (id text primary key, table_name text not null, column_name text not null, row_id text not null, kms_key_id text not null, encrypted_data_key text not null, algorithm text not null, key_version text not null, created_at timestamptz not null default now(), unique(table_name,column_name,row_id));
-- verify:
SELECT to_regclass('config.kms_envelopes') IS NOT NULL AS ok;
-- /verify
