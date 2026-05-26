-- ticket: P13.O09
-- owner: onboarding
-- forward-only: yes
-- expand-contract: expand
-- rebuildable: no

CREATE TABLE IF NOT EXISTS onboarding_state (
  id text PRIMARY KEY CHECK (id LIKE 'onb\_%' ESCAPE '\\'),
  tenant_id text NOT NULL,
  environment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('created','in_progress','requires_action','pending_review','completed','failed','canceled')),
  current_step text,
  step_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  kyb_decision_id text,
  evidence_file_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  first_api_key_id text,
  first_transfer_intent_id text,
  completion_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS onboarding_state_tenant_id_idx ON onboarding_state(tenant_id);
CREATE INDEX IF NOT EXISTS onboarding_state_environment_id_idx ON onboarding_state(environment_id);
DROP TRIGGER IF EXISTS onboarding_state_set_updated_at ON onboarding_state;
CREATE TRIGGER onboarding_state_set_updated_at BEFORE UPDATE ON onboarding_state FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- verify:
SELECT to_regclass('public.onboarding_state') IS NOT NULL AS ok;
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='onboarding_state_tenant_id_idx') AS ok;
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_state' AND column_name='completion_event_id') AS ok;
-- /verify
