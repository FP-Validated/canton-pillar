import { loadEvent } from '../../../server/loaders/events';
import { ResultView } from '../../../components/StateViews';
export default async function Page({ params }: { params: { id: string } }) { return <main><h1>Event</h1><ResultView result={await loadEvent(params.id)} pick={(v:any)=>[v]}/></main>; }
