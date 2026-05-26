import { pillarFetch, request } from './common';
export async function loadNetworks() {
  const [bindings, networks] = await Promise.all([pillarFetch<any>(request, '/network/bindings'), pillarFetch<any>(request, '/admin/network/networks')]);
  return { bindings, networks };
}
export async function loadNetworkBindings() {
  const r = await pillarFetch<any>(request, '/network/bindings');
  return r.ok ? r.value : { data: [] };
}
