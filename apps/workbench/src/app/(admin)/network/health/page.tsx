import { AdminListPage } from '../../admin-ui';
export default function Page(){return <AdminListPage title="Validator health" description="Live validator health snapshots." path="/admin/network/validators/health" columns={["id","validator_id","status","lag_ms","last_seen_at"]}/>}
