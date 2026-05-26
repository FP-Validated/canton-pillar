-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS api_key_id text, ADD COLUMN IF NOT EXISTS principal_id text, ADD COLUMN IF NOT EXISTS decision_id text, ADD COLUMN IF NOT EXISTS policy_version_id text, ADD COLUMN IF NOT EXISTS masked_request_hash text, ADD COLUMN IF NOT EXISTS scope_decision jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS constraint_decision jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS audit_log_api_key_id_idx ON audit_log(api_key_id);
CREATE INDEX IF NOT EXISTS audit_log_decision_id_idx ON audit_log(decision_id);
-- verify:
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='api_key_id') AS ok;
-- /verify
