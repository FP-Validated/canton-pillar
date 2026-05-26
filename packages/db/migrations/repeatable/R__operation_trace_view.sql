-- ticket: P3.D28
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE OR REPLACE VIEW operation_trace_view AS SELECT o.tenant_id,o.operation_id,o.request_id,o.idempotency_key_hash,o.command_id,o.ledger_trace_id,o.status FROM operations o;

-- verify:
SELECT to_regclass('public.operation_trace_view') IS NOT NULL AS ok;
-- /verify
