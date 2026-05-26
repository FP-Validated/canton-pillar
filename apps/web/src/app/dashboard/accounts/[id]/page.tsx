import { ResourceDetailShell } from '@/components/dashboard/ResourceDetailShell';
import { accounts, getAccountById } from '@/lib/mockData';
import { accountSummary } from '@/lib/dashboard/selectors';
export function generateStaticParams(){return accounts.map((item)=>({id:item.id}));}
export default function Page({params}:{params:{id:string}}){const item=getAccountById(params.id); if(!item) return null; const summary=accountSummary(item.id); return <ResourceDetailShell section="Accounts" id={item.id} status={item.status} record={item} attributes={[{label:'ID',value:item.id,copy:item.id},{label:'Name',value:item.display_name},{label:'Total balance',value:summary.totalBalance},{label:'Reserved',value:summary.reserved},{label:'Holdings',value:String(summary.holdings)},{label:'Created',value:item.created}]} related={[{label:'Holdings',href:'/dashboard/holdings',meta:String(summary.holdings)}]} />;}
