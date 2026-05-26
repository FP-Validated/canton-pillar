import { loadWebhooks } from '../../server/loaders/webhooks';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Webhooks</h1><ResultView result={await loadWebhooks()}/></main>; }
