import { KpiCard } from '@/components/dashboard/KpiCard';
import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { apiRequestLog } from '@/lib/mockData';
import { requestStats } from '@/lib/dashboard/selectors';
const stats=requestStats();
const rows=apiRequestLog.map((item)=>({id:item.id,status:item.status_code>=400?'failed':'succeeded',type:item.method,primary:item.path,amount:`${item.latency_ms}ms`,created:item.created,href:'/dashboard/developers',raw:item}));
export default function Page(){return <ResourceListShell title="Developers" section="Developers" description="API request log with latency, error posture, and request identifiers." rows={rows} statuses={['All','succeeded','failed']}><div className="grid gap-4 md:grid-cols-3"><KpiCard label="Avg latency" value={`${stats.avgLatency}ms`} /><KpiCard label="Error rate" value={`${stats.errorRate}%`} /><KpiCard label="RPS" value={stats.rps} /></div></ResourceListShell>;}
