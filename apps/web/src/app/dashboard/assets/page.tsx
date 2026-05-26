import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { assets } from '@/lib/mockData';
const rows=assets.map((item)=>({id:item.id,status:item.status,type:item.object,primary:item.display_name,secondary:item.code,created:item.created,href:`/dashboard/assets/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Assets" section="Assets" description="Issued assets, restrictions, decimal precision, and issuer account mapping." rows={rows} statuses={['All','draft','active','paused','retired']} />;}
