-- ticket: P8
-- owner: security-compliance
-- forward-only: yes
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE IF NOT EXISTS audit.compliance_decisions (id text primary key, tenant_id text not null, account_id text not null, mode text not null check(mode in ('test','live')), subject_id text not null, decision text not null check(decision in ('approved','rejected','requires_action')), decision_trace_id text not null unique, policy_version_id text not null, kyc_status text not null, aml_rule_pack_version text not null, sanctions_list_version text not null, risk_score numeric(8,4) not null, risk_band text not null, reason_codes jsonb not null default '[]'::jsonb, input_facts_hash text not null, evidence_file_ids jsonb not null default '[]'::jsonb, ledger_workflow_enqueued boolean not null default false, created_at timestamptz not null default now());
CREATE INDEX IF NOT EXISTS compliance_decisions_tenant_subject_idx ON audit.compliance_decisions(tenant_id,subject_id,created_at DESC);
-- verify:
SELECT to_regclass('audit.compliance_decisions') IS NOT NULL AS ok;
-- /verify
