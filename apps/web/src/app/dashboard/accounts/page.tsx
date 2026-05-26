import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { accounts } from '@/lib/mockData';
const rows=accounts.map((item)=>({id:item.id,status:item.status,type:item.object,primary:item.display_name,created:item.created,href:`/dashboard/accounts/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Accounts" section="Accounts" description="Account directory with lifecycle state and metadata." rows={rows} statuses={['All','active','restricted','suspended','closed']} />;}
