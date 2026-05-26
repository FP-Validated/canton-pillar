import { loadIntents } from '../../server/loaders/intents';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Intents</h1><ResultView result={await loadIntents()}/></main>; }
