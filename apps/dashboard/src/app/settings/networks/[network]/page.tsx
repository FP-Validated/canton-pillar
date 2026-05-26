import { loadNetworkBindings } from '../../../../server/loaders/networks';

export default async function NetworkBindingPage({ params }:{ params:{ network:string } }){
  const bindings = await loadNetworkBindings();
  const binding = bindings.data.find((b:any)=>b.network===params.network);
  return <main style={{padding:24}}><h1>{params.network} validator route</h1><form><label>Primary validator<input name="validator" defaultValue={binding?.default_validator_id ?? ''}/></label><label>Fallback validator<input name="fallback" defaultValue={binding?.fallback_validator_id ?? ''}/></label><button type="submit">Save route</button></form><p>Tenant admins can choose active validators from verified providers. Pause or resume uses the live API proxy when auth is available.</p></main>;
}
