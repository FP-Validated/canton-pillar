-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE TABLE IF NOT EXISTS audit.dsar_requests (id text primary key, tenant_id text not null, account_id text not null, mode text not null check(mode in ('test','live')), subject_id text not null, request_type text not null check(request_type in ('access','export','delete','rectify')), status text not null check(status in ('submitted','processing','completed','rejected')), requester_principal_id text not null, decision_id text, response_object_key_ref text, created_at timestamptz not null default now(), completed_at timestamptz);
CREATE INDEX IF NOT EXISTS dsar_requests_subject_idx ON audit.dsar_requests(tenant_id,subject_id,created_at DESC);
-- verify:
SELECT to_regclass('audit.dsar_requests') IS NOT NULL AS ok;
-- /verify
