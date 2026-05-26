import { AdminListPage } from '../../admin-ui';
export default function Page(){return <AdminListPage title="Validator providers" description="Verify, pause, and disable validator providers." path="/admin/network/validator_providers" columns={["id","name","status","created"]} actions={["verify","pause","disable"]}/>}
