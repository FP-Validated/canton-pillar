-- ticket: P3.D24
-- owner: projection-worker
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE INDEX IF NOT EXISTS operation_projection_idx ON operations(operation_id, ledger_offset);
CREATE INDEX IF NOT EXISTS balances_account_asset_idx ON balances(tenant_id, account_id, asset_id);
CREATE INDEX IF NOT EXISTS holdings_account_asset_idx ON holdings(tenant_id, account_id, asset_id);

-- verify:
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='operation_projection_idx') AS ok;
-- /verify
