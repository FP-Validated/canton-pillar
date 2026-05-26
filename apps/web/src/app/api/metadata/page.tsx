import type { Metadata } from 'next';
import { CodePane } from '@/components/apiref/CodePane';
import { ParamTable } from '@/components/apiref/ParamTable';

export const metadata: Metadata = { title: 'Metadata API | Canton Pillar' };

export default function MetadataPage() {
  return <article className="space-y-10"><header className="space-y-4"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Getting started</p><h1 className="text-4xl font-bold text-ink">Metadata</h1><p className="text-lg text-slateMuted">Metadata stores business references as string key/value pairs.</p></header><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Shape and limits</h2><ParamTable params={[{name:'metadata',type:'object',required:true,description:'String to string map.'},{name:'keys',type:'string',description:'Maximum 50 keys; each key is at most 40 characters and cannot contain [ or ].'},{name:'values',type:'string',description:'Each value is at most 500 characters. Empty value unsets the key.'}]} /><CodePane code={{ metadata: { order_id: 'ord_123', desk: 'treasury' } }} /></section><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Forbidden data</h2><p className="text-slateMuted">Do not store regulated personal data, secrets, private keys, bank account numbers, government IDs, sanctions details, or deployment details in metadata.</p></section><section className="space-y-3"><h2 className="text-2xl font-bold text-ink">No control behavior</h2><p className="text-slateMuted">Metadata never affects authorization, compliance decisions, or settlement behavior. It is only returned on the public object for reconciliation and search.</p></section></article>;
}
