import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Audit" description="Identity audit log and compliance decisions trace." path="/admin/identity/audit" columns={["id","actor_id","action","resource_id","created"]}/>}
