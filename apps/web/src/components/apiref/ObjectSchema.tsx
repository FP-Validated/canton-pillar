import type { SchemaField } from './data';

type ObjectSchemaProps = {
  fields: SchemaField[];
};

export function ObjectSchema({ fields }: ObjectSchemaProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
          <tr>
            <th className="px-4 py-3">Field</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Required</th>
            <th className="px-4 py-3">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {fields.map((field) => (
            <tr key={field.name}>
              <td className="px-4 py-3 font-mono text-xs text-ink">{field.name}</td>
              <td className="px-4 py-3 text-slateMuted">{field.type}</td>
              <td className="px-4 py-3 text-slateMuted">{field.required ? 'yes' : 'no'}</td>
              <td className="px-4 py-3 text-slateMuted">{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
