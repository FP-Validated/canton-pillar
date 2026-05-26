export const entries = [{ version:'2026-05-26', title:'Dashboard, docs, onboarding' }];
export function ChangelogRenderer(){ return <ul>{entries.map(e=><li key={e.version}>{e.version}: {e.title}</li>)}</ul>; }
