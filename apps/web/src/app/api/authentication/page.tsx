import type { Metadata } from 'next';
import { CodePane } from '@/components/apiref/CodePane';
import { ObjectSchema } from '@/components/apiref/ObjectSchema';
import { ParamTable } from '@/components/apiref/ParamTable';

export const metadata: Metadata = { title: 'Authentication API | Canton Pillar' };

export default function AuthenticationPage() {
  return (
    <article className="space-y-10">
      <header className="space-y-4"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Getting started</p><h1 className="text-4xl font-bold text-ink">Authentication</h1><p className="text-lg text-slateMuted">Canton Pillar authenticates API requests with bearer API keys.</p></header>
      <section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Bearer tokens</h2><p className="text-slateMuted">Send the secret key in the Authorization header over HTTPS only.</p><CodePane language="http" code="Authorization: Bearer plr_sk_test_51HY..." /></section>
      <section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Key families</h2><ObjectSchema fields={[{name:'secret test',type:'plr_sk_test_',required:true,description:'Server-side test key.'},{name:'secret live',type:'plr_sk_live_',required:true,description:'Server-side live key.'},{name:'restricted test',type:'plr_rk_test_',required:true,description:'Scoped server-side test key.'},{name:'restricted live',type:'plr_rk_live_',required:true,description:'Scoped server-side live key.'},{name:'publishable test',type:'plr_pk_test_',required:true,description:'Client-safe test identifier.'},{name:'publishable live',type:'plr_pk_live_',required:true,description:'Client-safe live identifier.'}]} /></section>
      <section className="space-y-3"><h2 className="text-2xl font-bold text-ink">Storage and descriptors</h2><p className="text-slateMuted">Livemode is determined by the key family. Canton Pillar stores a hash, prefix, and last4; it never echoes full keys after creation. Public descriptors use ak_ IDs.</p><ParamTable params={[{name:'id',type:'string',required:true,description:'ak_ descriptor ID.'},{name:'prefix',type:'string',required:true,description:'Visible key family prefix.'},{name:'last4',type:'string',required:true,description:'Safe last four characters.'}]} /></section>
    </article>
  );
}
