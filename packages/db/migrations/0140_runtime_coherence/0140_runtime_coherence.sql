-- ticket: REM-01 (R-Coherence)
-- owner: ledger-command + api + sse
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no
-- Brings runtime DB schema into agreement with the Kotlin
-- `CommandRequestRepository`, the API `enqueueIntent` payload, the
-- SSE `EventLogTailer`, and the projection-worker `EventLogNotifier`.

-- ledger_command_requests: columns the Kotlin worker actually reads/writes
ALTER TABLE ledger_command_requests
  ADD COLUMN IF NOT EXISTS command_type text,
  ADD COLUMN IF NOT EXISTS command_semantic_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS command_payload jsonb,
  ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS participant_id text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS available_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_token text,
  ADD COLUMN IF NOT EXISTS leased_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS ledger_command_requests_available_idx
  ON ledger_command_requests(available_at)
  WHERE status IN ('received','queued','pending');

CREATE INDEX IF NOT EXISTS ledger_command_requests_participant_idx
  ON ledger_command_requests(participant_id);

-- operations: completion correlator write-back fields
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS submission_id text,
  ADD COLUMN IF NOT EXISTS update_id text,
  ADD COLUMN IF NOT EXISTS participant_id text,
  ADD COLUMN IF NOT EXISTS synchronizer_id text,
  ADD COLUMN IF NOT EXISTS ledger_recorded_at timestamptz;

-- event_log: livemode mode column + NOTIFY trigger consumed by SSE tailer
ALTER TABLE event_log
  ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS event_log_tenant_livemode_created_idx
  ON event_log(tenant_id, livemode, created_at);

CREATE OR REPLACE FUNCTION event_log_notify() RETURNS trigger AS $$
DECLARE
  mode_token text;
BEGIN
  mode_token := CASE WHEN NEW.livemode THEN 'live' ELSE 'test' END;
  PERFORM pg_notify(
    'pillar.event_log',
    COALESCE(NEW.tenant_id, '_') || ':' || mode_token || ':' || NEW.id
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_log_notify ON event_log;
CREATE TRIGGER event_log_notify AFTER INSERT ON event_log
FOR EACH ROW EXECUTE FUNCTION event_log_notify();

-- verify:
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='ledger_command_requests' AND column_name='command_type') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='ledger_command_requests' AND column_name='command_payload') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='ledger_command_requests' AND column_name='available_at') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='ledger_command_requests' AND column_name='lease_token') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='operations' AND column_name='submission_id') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='operations' AND column_name='ledger_recorded_at') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name='event_log' AND column_name='livemode') AS ok;
SELECT EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgname='event_log_notify' AND tgrelid='public.event_log'::regclass) AS ok;
-- /verify
