import { loadOperation } from '../../../server/loaders/operations';
import { ResultView } from '../../../components/StateViews';
export default async function Page({ params }: { params: { id: string } }) { return <main><h1>Operation</h1><ResultView result={await loadOperation(params.id)} pick={(v:any)=>[v]}/></main>; }
