-- ticket: P3.D14
-- owner: audit
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE INDEX IF NOT EXISTS api_requests_operation_id_trace_idx ON api_requests(operation_id);
CREATE INDEX IF NOT EXISTS audit_log_operation_id_trace_idx ON audit_log(operation_id);

-- Cross-group trace indexes are created by their owning table migrations to preserve forward-only ordering.

-- verify:
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='api_requests_operation_id_trace_idx') AS ok;
-- /verify
