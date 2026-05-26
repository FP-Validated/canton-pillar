import { z } from 'zod';
import { Livemode, Metadata, Timestamp } from '../common.js';

export const OnboardingSessionId = z.string().regex(/^onb_[A-Za-z0-9_\-]+$/);
export const OnboardingStatus = z.enum(['created','in_progress','requires_action','pending_review','completed','failed','canceled']);
export const OnboardingStep = z.enum(['organization','kyb','sandbox','api_key','webhook','first_transfer','completed']);
export const OnboardingNextAction = z.object({
  type: z.enum(['collect_input','wait','redirect','done','error']),
  step: OnboardingStep,
  label: z.string(),
  href: z.string().optional(),
  required_fields: z.array(z.string()).default([]),
  retry_after_seconds: z.number().int().positive().optional(),
});
export const OnboardingSession = z.object({
  id: OnboardingSessionId,
  object: z.literal('onboarding_session'),
  livemode: Livemode,
  tenant_id: z.string(),
  environment_id: z.string(),
  status: OnboardingStatus,
  current_step: OnboardingStep.nullable(),
  step_state: z.record(z.unknown()).default({}),
  kyb_decision_id: z.string().nullable().optional(),
  evidence_file_ids: z.array(z.string()).default([]),
  first_api_key_id: z.string().nullable().optional(),
  first_transfer_intent_id: z.string().nullable().optional(),
  completion_event_id: z.string().nullable().optional(),
  next_action: OnboardingNextAction.optional(),
  metadata: Metadata.optional(),
  created: Timestamp,
  updated: Timestamp,
  completed_at: Timestamp.nullable().optional(),
});
export const OnboardingSessionCreateRequest = z.object({
  environment_id: z.string().min(1),
  organization: z.object({ name: z.string().min(1), website: z.string().url().optional(), country: z.string().min(2).max(2).optional() }).optional(),
  metadata: Metadata.optional(),
});
export const OnboardingSessionAdvanceRequest = z.object({ step: OnboardingStep, input: z.record(z.unknown()).default({}) });
export const OnboardingSessionListResponse = z.object({ object: z.literal('list'), url: z.string(), has_more: z.boolean(), data: z.array(OnboardingSession) });
