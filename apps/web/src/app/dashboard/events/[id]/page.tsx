import { ResourceDetailShell } from '@/components/dashboard/ResourceDetailShell';
import { events, getEventById } from '@/lib/mockData';
export function generateStaticParams(){return events.map((item)=>({id:item.id}));}
export default function Page({params}:{params:{id:string}}){const item=getEventById(params.id); if(!item) return null; return <ResourceDetailShell section="Events" id={item.id} record={item} attributes={[{label:'ID',value:item.id,copy:item.id},{label:'Type',value:item.type},{label:'Resource',value:item.resource_id,copy:item.resource_id},{label:'Resource type',value:item.resource_type},{label:'Created',value:item.created}]} related={[{label:'Resource',href:'#',meta:item.resource_type}]} />;}
