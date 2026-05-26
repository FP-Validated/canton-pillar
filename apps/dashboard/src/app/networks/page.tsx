import { loadNetworks } from '../../server/loaders/networks';
import { ErrorState, ResultView } from '../../components/StateViews';
export default async function Page(){ const n=await loadNetworks(); if(!n.bindings.ok) return <ErrorState message={n.bindings.error.message}/>; return <main><h1>Networks</h1><ResultView result={n.bindings}/><ResultView result={n.networks}/></main>; }
