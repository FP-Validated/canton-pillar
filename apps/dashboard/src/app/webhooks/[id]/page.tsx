import { loadWebhookDeliveries } from '../../../server/loaders/webhooks';
import { ResultView } from '../../../components/StateViews';
export default async function Page({ params }: { params: { id: string } }) { return <main><h1>Webhook deliveries</h1><ResultView result={await loadWebhookDeliveries(params.id)}/></main>; }
