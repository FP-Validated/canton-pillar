import { AdminListPage } from '../(admin)/admin-ui';
export default function Page(){return <AdminListPage title="Projection health" description="Per-projector lag and checkpoints." path="/admin/projection/checkpoints" columns={["id","projector","lag_ms","ledger_offset","last_indexed_at"]}/>}
