import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { apiKeys } from '@/lib/mockData';
const rows=apiKeys.map((item)=>({id:item.id,status:item.status,type:item.prefix,primary:item.name,secondary:item.scopes.join(', '),created:item.created,href:'/dashboard/api-keys',raw:item}));
export default function Page(){return <ResourceListShell title="API keys" section="API keys" description="Read-only key inventory with scope and expiry posture." rows={rows} statuses={['All','active','expired','revoked']} noActions><div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Secret material is never displayed; rotate keys from the secure operations console.</div></ResourceListShell>;}
