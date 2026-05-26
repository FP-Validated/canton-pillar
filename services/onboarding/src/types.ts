export type Step = 'organization'|'kyb'|'sandbox'|'api_key'|'webhook'|'first_transfer'|'completed';
export type Status = 'created'|'in_progress'|'requires_action'|'pending_review'|'completed'|'failed'|'canceled';
export interface OnboardingSession { id:string; tenant_id:string; environment_id:string; status:Status; current_step:Step|null; step_state:Record<string, any>; kyb_decision_id?:string|null; evidence_file_ids:string[]; first_api_key_id?:string|null; first_transfer_intent_id?:string|null; completion_event_id?:string|null; created_at:string; updated_at:string; completed_at?:string|null; }
export interface StepResult { session: OnboardingSession; event?: 'onboarding.requires_action'|'onboarding.failed'|'onboarding.completed'; }
export const now = () => new Date().toISOString();
