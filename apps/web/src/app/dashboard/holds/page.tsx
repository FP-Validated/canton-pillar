import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { holds } from '@/lib/mockData';
const rows=holds.map((item)=>({id:item.id,status:item.status,type:item.object,primary:item.reason,secondary:item.holding_id,amount:item.amount,created:item.created,href:`/dashboard/holds/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Holds" section="Holds" description="Active and historical reservations across holdings." rows={rows} statuses={['All','requires_action','active','released','expired','failed']} />;}
