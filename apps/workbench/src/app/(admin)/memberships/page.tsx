import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Memberships" description="Invite users and change tenant roles." path="/admin/identity/memberships" columns={["id","tenant_id","user_id","email","role","status"]} actions={["role","disable","enable"]}/>}
