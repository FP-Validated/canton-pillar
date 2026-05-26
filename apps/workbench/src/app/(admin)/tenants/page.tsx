import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Tenants" description="Manage tenant lifecycle and memberships." path="/admin/identity/tenants" columns={["id","slug","display_name","billing_status"]} actions={["disable","enable"]}/>}
