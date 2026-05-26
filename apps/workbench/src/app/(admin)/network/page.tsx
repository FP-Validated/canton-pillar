import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Networks" description="Manage registered networks." path="/admin/network/networks" columns={["id","slug","display_name","status"]} actions={["pause","disable"]}/>}
