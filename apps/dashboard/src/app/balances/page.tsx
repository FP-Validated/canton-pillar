import { loadBalances } from '../../server/loaders/balances';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Balances</h1><ResultView result={await loadBalances({limit:50})}/></main>; }
