import { loadOpenApi } from '../lib/openapi/load';
export function OpenApiRenderer() { const spec = loadOpenApi(); return <div><p>Checksum: {spec.checksum}</p>{spec.paths.map(p => <section key={p}><h2>{p}</h2></section>)}</div>; }
