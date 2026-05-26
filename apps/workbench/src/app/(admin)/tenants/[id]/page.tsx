import { AdminDetailPage } from '../../admin-ui';
export default function Page({params}:{params:{id:string}}){return <AdminDetailPage title="Tenant detail and memberships" path={`/admin/identity/tenants/${params.id}`}/>}
