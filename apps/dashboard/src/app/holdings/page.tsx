import { loadHoldings } from '../../server/loaders/holdings';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Holdings</h1><ResultView result={await loadHoldings({limit:50})}/></main>; }
