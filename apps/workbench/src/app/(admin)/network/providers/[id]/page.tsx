import { AdminDetailPage } from '../../../admin-ui';
export default function Page({params}:{params:{id:string}}){return <AdminDetailPage title="Validator provider detail" path={`/admin/network/validator_providers/${params.id}`}/>}
