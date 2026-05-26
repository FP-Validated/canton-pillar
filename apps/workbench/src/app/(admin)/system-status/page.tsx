import { AdminListPage } from '../admin-ui';
export default function Page(){return <AdminListPage title="System status" description="Cross-service health summary." path="/health" columns={["object","status","api_version","deployment_mode"]}/>}
