import { ResourceDetailShell } from '@/components/dashboard/ResourceDetailShell';
import { assets, getAssetById } from '@/lib/mockData';
import { assetSummary } from '@/lib/dashboard/selectors';
export function generateStaticParams(){return assets.map((item)=>({id:item.id}));}
export default function Page({params}:{params:{id:string}}){const item=getAssetById(params.id); if(!item) return null; const summary=assetSummary(item.id); return <ResourceDetailShell section="Assets" id={item.id} status={item.status} record={item} attributes={[{label:'ID',value:item.id,copy:item.id},{label:'Code',value:item.code},{label:'Name',value:item.display_name},{label:'Total quantity',value:summary.totalQuantity},{label:'Holdings',value:String(summary.holdings)},{label:'Restrictions',value:item.restrictions.join(', ')}]} related={[{label:'Issuer account',href:`/dashboard/accounts/${item.issuer_account_id}`,meta:'issuer'}]} />;}
