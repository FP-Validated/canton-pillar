import { loadUsage } from '../../server/loaders/billing';
import { BillingUnavailable, ResultView } from '../../components/StateViews';
export default async function Page(){ const r=await loadUsage(); if(!r.ok&&r.status===404) return <BillingUnavailable reason="Tenant has no billing configuration yet."/>; return <main><h1>Usage</h1><ResultView result={r} pick={(v:any)=>v?.totals??v?.data??[]}/></main>; }
