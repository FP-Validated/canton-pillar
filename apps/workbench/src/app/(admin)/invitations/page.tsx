import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Invitations" description="Pending identity invitations." path="/admin/identity/invitations" columns={["id","email","tenant_id","role","status"]} actions={["revoke"]}/>}
