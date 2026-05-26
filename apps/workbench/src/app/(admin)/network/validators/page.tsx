import { AdminListPage } from '../../admin-ui';
export default function Page(){return <AdminListPage title="Validators" description="Activate, degrade, or disable validators by network." path="/admin/network/validators" columns={["id","network_id","provider_id","status","capacity_tier"]} actions={["activate","degrade","disable"]}/>}
