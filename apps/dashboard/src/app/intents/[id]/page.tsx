import { loadIntent } from '../../../server/loaders/intents';
import { ResultView } from '../../../components/StateViews';
export default async function Page({ params }: { params: { id: string } }) { return <main><h1>Intent</h1><ResultView result={await loadIntent(params.id)} pick={(v:any)=>[v]}/></main>; }
