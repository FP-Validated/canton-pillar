import { loadOperations } from '../../server/loaders/operations';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Operations</h1><ResultView result={await loadOperations({limit:50})}/></main>; }
