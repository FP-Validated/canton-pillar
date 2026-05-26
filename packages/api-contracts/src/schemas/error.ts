import { z } from 'zod';
import { RequestId } from './ids.js';

export const ErrorType = z.enum(['invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error', 'idempotency_error', 'rate_limit_error', 'version_error', 'ledger_error', 'projection_error', 'webhook_error', 'api_error']);
export const ErrorCode = z.enum(['invalid_parameter', 'missing_required_parameter', 'unsupported_expand', 'metadata_too_large', 'idempotency_key_required', 'idempotency_key_reused', 'insufficient_holding', 'asset_not_transferable', 'intent_already_final', 'ledger_command_rejected', 'ledger_completion_timeout', 'projection_lag_exceeded', 'rate_limit_exceeded', 'api_key_expired', 'api_version_unsupported', 'webhook_signature_verification_failed']);

export const ErrorEnvelope = z.object({
  error: z.object({
    type: ErrorType,
    code: ErrorCode,
    message: z.string(),
    param: z.string().optional(),
    request_id: RequestId,
    doc_url: z.string().url().optional(),
  }),
});
