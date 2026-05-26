import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { webhookEndpoints } from '@/lib/mockData';
const rows=webhookEndpoints.map((item)=>({id:item.id,status:item.status,type:item.object,primary:item.description,secondary:item.url,created:item.created,href:`/dashboard/webhooks/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Webhooks" section="Webhooks" description="Endpoint configuration, delivery state, and subscribed event types." rows={rows} statuses={['All','enabled','disabled']} />;}
