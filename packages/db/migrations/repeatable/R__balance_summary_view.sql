-- ticket: P3.D28
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE OR REPLACE VIEW balance_summary_view AS SELECT tenant_id, account_id, asset_id, available, pending, reserved, as_of_ledger_offset FROM balances;

-- verify:
SELECT to_regclass('public.balance_summary_view') IS NOT NULL AS ok;
-- /verify
