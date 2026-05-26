import Link from 'next/link';
import { loadNetworkBindings } from '../../../server/loaders/networks';

export default async function NetworksSettingsPage(){
  const bindings = await loadNetworkBindings();
  return <main style={{padding:24}}><h1>Networks</h1><p>Tenant validator routing for Canton Pillar networks.</p><div style={{display:'grid', gap:12}}>{bindings.data.map((b:any)=><section key={b.network} style={{border:'1px solid #ddd', borderRadius:12, padding:16}}><h2>{b.network}</h2><p>Status: {b.status}</p><p>Primary validator: {b.default_validator_id}</p><p>Fallback: {b.fallback_validator_id ?? 'none'}</p><Link href={`/settings/networks/${b.network}`}>Configure</Link></section>)}</div></main>;
}
