import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { operations } from '@/lib/mockData';
const rows=operations.map((item)=>({id:item.id,status:item.status,type:item.resource_type,primary:item.resource_id,amount:`${item.latency_ms}ms`,updated:item.updated,href:`/dashboard/operations/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Operations" section="Operations" description="Command runtime state with latency and related resource context." rows={rows} statuses={['All','received','queued','submitted','in_flight','ledger_committed','projected','failed','unknown','reconciled']} />;}
