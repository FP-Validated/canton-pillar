import { pillarFetch, request } from './common';

export async function loadIntents() {
  const [issue, redeem, transfer] = await Promise.all([
    pillarFetch<any>(request, '/issue_intents'),
    pillarFetch<any>(request, '/redeem_intents'),
    pillarFetch<any>(request, '/transfer_intents')
  ]);
  const firstErr = [issue, redeem, transfer].find(r => !r.ok);
  if (firstErr && !firstErr.ok) return firstErr;
  const data = [issue, redeem, transfer].flatMap((r: any) => r.value?.data ?? []).sort((a: any, b: any) => String(b.created ?? b.created_at ?? '').localeCompare(String(a.created ?? a.created_at ?? '')));
  return { ok: true as const, value: { object: 'list', data, has_more: false, url: '/intents' }, headers: issue.headers };
}
export function loadIntent(id: string) { return pillarFetch<any>(request, `/intents/${encodeURIComponent(id)}`); }
