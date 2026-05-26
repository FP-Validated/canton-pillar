-- ticket: P3.D28
-- owner: platform
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: yes

CREATE OR REPLACE VIEW webhook_health_view AS SELECT e.tenant_id, e.id endpoint_id, e.enabled, count(d.id) delivery_count FROM webhook_endpoints e LEFT JOIN webhook_deliveries d ON d.endpoint_id=e.id GROUP BY e.tenant_id,e.id,e.enabled;

-- verify:
SELECT to_regclass('public.webhook_health_view') IS NOT NULL AS ok;
-- /verify
