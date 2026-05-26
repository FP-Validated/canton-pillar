import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { holdings } from '@/lib/mockData';
const rows=holdings.map((item)=>({id:item.id,status:item.status,type:item.object,primary:item.account_id,secondary:item.asset_id,quantity:item.quantity,updated:item.updated,href:`/dashboard/holdings/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Holdings" section="Holdings" description="Inventory positions with reserved quantity, account, asset, and lifecycle status." rows={rows} statuses={['All','active','partially_reserved','reserved','frozen','redeeming','closed']} />;}
