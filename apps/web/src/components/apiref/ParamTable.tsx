import type { Param } from './data';

type ParamTableProps = {
  title?: string;
  params?: Param[];
};

export function ParamTable({ title, params = [] }: ParamTableProps) {
  if (params.length === 0) return null;
  return (
    <div className="space-y-2">
      {title ? <h4 className="text-sm font-semibold text-ink">{title}</h4> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Required</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {params.map((param) => (
              <tr key={param.name}>
                <td className="px-4 py-3 font-mono text-xs text-ink">{param.name}</td>
                <td className="px-4 py-3 text-slateMuted">{param.type}</td>
                <td className="px-4 py-3 text-slateMuted">{param.required ? 'yes' : 'no'}</td>
                <td className="px-4 py-3 text-slateMuted">{param.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
