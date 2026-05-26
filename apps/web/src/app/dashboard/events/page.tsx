import { ResourceListShell } from '@/components/dashboard/ResourceListShell';
import { events } from '@/lib/mockData';
const rows=events.map((item)=>({id:item.id,type:item.type,primary:item.resource_id,secondary:item.resource_type,created:item.created,href:`/dashboard/events/${item.id}`,raw:item}));
export default function Page(){return <ResourceListShell title="Events" section="Events" description="Append-only event stream with free-text filtering by event type or resource." rows={rows} statuses={['All']} />;}
