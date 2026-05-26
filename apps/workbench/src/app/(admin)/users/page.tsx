import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Users" description="Manage identity users." path="/admin/identity/users" columns={["id","email","status","role"]} actions={["disable","enable"]}/>}
