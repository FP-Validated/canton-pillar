import { AdminDetailPage } from '../../../admin-ui';
export default function Page({params}:{params:{id:string}}){return <AdminDetailPage title="Validator detail" path={`/admin/network/validators/${params.id}`}/>}
