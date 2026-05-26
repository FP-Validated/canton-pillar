import{kpis}from'../lib/mock/data';export default function Page(){return <main><h1>Pillar Workbench</h1>{kpis.map(([k,v])=><div className='card' key={k}><b>{k}</b><p>{v}</p></div>)}</main>}
