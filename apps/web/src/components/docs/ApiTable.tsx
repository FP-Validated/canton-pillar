import type { ReactNode } from 'react';

export type ApiTableColumn = { header: string; accessor: string };

export function ApiTable({ columns, rows }: { columns: ApiTableColumn[]; rows: Record<string, ReactNode>[] }) {
  return <div className="my-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-full border-collapse text-left text-sm"><thead className="sticky top-0 bg-bgSoft text-xs uppercase tracking-wide text-slateMuted"><tr>{columns.map((column) => <th key={column.accessor} className="border-b border-slate-200 px-4 py-3 font-semibold">{column.header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-100 last:border-0">{columns.map((column) => <td key={column.accessor} className="max-w-md px-4 py-4 align-top leading-6 text-slateMuted">{row[column.accessor]}</td>)}</tr>)}</tbody></table></div>;
}
