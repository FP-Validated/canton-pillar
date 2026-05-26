import type { Metadata } from 'next';
import { CodePane } from '@/components/apiref/CodePane';
import { ObjectSchema } from '@/components/apiref/ObjectSchema';

export const metadata: Metadata = { title: 'Errors API | Canton Pillar' };

const codes = ['missing_required_parameter','idempotency_key_required','idempotency_key_reused','metadata_too_large','unsupported_expand','insufficient_holding','asset_not_transferable','intent_already_final','ledger_command_rejected','ledger_completion_timeout','projection_lag_exceeded','rate_limit_exceeded','api_key_expired','api_version_unsupported','webhook_signature_verification_failed'];

export default function ErrorsPage() {
  return <article className="space-y-10"><header className="space-y-4"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Getting started</p><h1 className="text-4xl font-bold text-ink">Errors</h1><p className="text-lg text-slateMuted">Every error includes request_id and doc_url for support and debugging.</p></header><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Envelope</h2><CodePane code={{ error: { type: 'invalid_request_error', code: 'missing_required_parameter', message: 'Missing required parameter: amount.', param: 'amount', request_id: 'req_01J0F8Q4Y6B7C8D9E0F1G2H3J4', doc_url: 'https://docs.pillar.example/errors/missing_required_parameter' } }} /></section><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Types</h2><ObjectSchema fields={['invalid_request_error','authentication_error','permission_error','not_found_error','idempotency_error','rate_limit_error','version_error','ledger_error','projection_error','webhook_error','api_error'].map((type)=>({name:type,type:'error type',required:true,description:'Typed error envelope category.'}))} /></section><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Codes</h2><div className="flex flex-wrap gap-2">{codes.map((code)=><code key={code} className="rounded-full bg-bgSoft px-3 py-1 text-xs text-slateMuted">{code}</code>)}</div></section></article>;
}
