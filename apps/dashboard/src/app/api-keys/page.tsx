import { loadApiKeys } from '../../server/loaders/apiKeys';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>API keys</h1><ResultView result={await loadApiKeys()}/></main>; }
