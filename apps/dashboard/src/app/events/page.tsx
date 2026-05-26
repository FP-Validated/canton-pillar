import { loadEvents } from '../../server/loaders/events';
import { ResultView } from '../../components/StateViews';
export default async function Page(){ return <main><h1>Events</h1><ResultView result={await loadEvents({limit:50})}/></main>; }
