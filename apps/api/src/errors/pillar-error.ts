export type PillarErrorType = 'invalid_request_error'|'authentication_error'|'permission_error'|'not_found_error'|'idempotency_error'|'rate_limit_error'|'version_error'|'ledger_error'|'projection_error'|'webhook_error'|'api_error';
export class PillarError extends Error {
  constructor(public type: PillarErrorType, public code: string, public statusCode: number, message: string, public param?: string) { super(message); }
  static invalid(code='invalid_parameter', message='Invalid request.', param?: string) { return new PillarError('invalid_request_error', code, 400, message, param); }
  static auth(message='Missing or invalid API key.') { return new PillarError('authentication_error','authentication_required',401,message); }
  static permission(message='Permission denied.') { return new PillarError('permission_error','permission_denied',403,message); }
  static notFound(message='Resource not found.') { return new PillarError('not_found_error','resource_missing',404,message); }
  static idempotency(code='idempotency_key_required', message='Idempotency-Key is required.', status=400) { return new PillarError('idempotency_error',code,status,message); }
  static rateLimit() { return new PillarError('rate_limit_error','rate_limit_exceeded',429,'Too many requests.'); }
  static version() { return new PillarError('version_error','api_version_unsupported',400,'Unsupported API version.'); }
  static projection(code='projection_lag_exceeded', message='Projection is unavailable.') { return new PillarError('projection_error',code,503,message); }
  static api(message='Internal API error.') { return new PillarError('api_error','internal_error',500,message); }
}
