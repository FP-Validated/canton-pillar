import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="Webhook DLQ" description="Inspect, requeue, drop, and replay failed webhook deliveries." path="/webhook_dlq" columns={["id","event_id","endpoint_id","status","attempt_count"]} actions={["requeue","drop","replay"]}/>}
