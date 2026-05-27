-- ticket: A2.webhook-dispatcher
-- owner: webhook-dispatcher
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS signing_secret text;

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_body_sample text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

UPDATE webhook_deliveries
SET next_attempt_at = COALESCE(next_attempt_at, next_retry_at, created_at, now())
WHERE next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx
  ON webhook_deliveries(next_attempt_at, created_at)
  WHERE status = 'pending';

-- verify:
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='webhook_endpoints' AND column_name='signing_secret') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='webhook_deliveries' AND column_name='next_attempt_at') AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes
  WHERE schemaname='public' AND indexname='webhook_deliveries_pending_idx') AS ok;
-- /verify
