import type { Endpoint } from './data';
import { CodePane } from './CodePane';
import { HttpMethodBadge } from './HttpMethodBadge';
import { ParamTable } from './ParamTable';

type EndpointBlockProps = {
  endpoint: Endpoint;
};

export function EndpointBlock({ endpoint }: EndpointBlockProps) {
  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <HttpMethodBadge method={endpoint.method} />
        <code className="rounded-lg bg-bgSoft px-3 py-1 font-mono text-sm text-ink">{endpoint.path}</code>
      </div>
      <p className="text-slateMuted">{endpoint.description}</p>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Request headers</h4>
        <ul className="grid gap-2 text-sm text-slateMuted sm:grid-cols-3">
          {endpoint.headers.map((header) => (
            <li key={header} className="rounded-xl bg-bgSoft px-3 py-2 font-mono text-xs text-ink">{header}</li>
          ))}
        </ul>
      </div>
      <ParamTable title="Path parameters" params={endpoint.pathParams} />
      <ParamTable title="Query parameters" params={endpoint.queryParams} />
      <ParamTable title="Body parameters" params={endpoint.bodyParams} />
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Response shape</h4>
        <p className="text-sm text-slateMuted">{endpoint.response}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">Example request</h4>
          <CodePane code={endpoint.request} language="bash" />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">Example response</h4>
          <CodePane code={endpoint.responseJson} />
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Errors</h4>
        <div className="flex flex-wrap gap-2">
          {endpoint.errors.map((error) => (
            <code key={error} className="rounded-full bg-bgSoft px-3 py-1 text-xs text-slateMuted">{error}</code>
          ))}
        </div>
      </div>
    </section>
  );
}
