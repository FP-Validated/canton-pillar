import { AdminDetailPage } from '../../admin-ui';
export default function Page({params}:{params:{id:string}}){return <AdminDetailPage title="User detail" path={`/admin/identity/users/${params.id}`}/>}
