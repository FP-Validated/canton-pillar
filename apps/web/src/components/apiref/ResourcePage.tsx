import { notFound } from 'next/navigation';
import { CodePane } from './CodePane';
import { EndpointBlock } from './EndpointBlock';
import { ObjectSchema } from './ObjectSchema';
import { getResource } from './data';

type ResourcePageProps = {
  slug: string;
};

export function ResourcePage({ slug }: ResourcePageProps) {
  const resource = getResource(slug);
  if (!resource) notFound();
  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Resource</p>
        <h1 className="text-4xl font-bold tracking-tight text-ink">{resource.title}</h1>
        <p className="text-lg text-slateMuted">{resource.description}</p>
      </header>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">The {resource.objectName} object</h2>
        <ObjectSchema fields={resource.schema} />
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-ink">Example object</h2>
        <CodePane code={resource.example} />
      </section>
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-ink">Endpoints</h2>
        {resource.endpoints.map((endpoint) => (
          <EndpointBlock key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} />
        ))}
      </section>
    </article>
  );
}
