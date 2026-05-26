import type { ReactNode } from 'react';

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; }

export function DataTable<T extends { id: string }>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
          <tr>{columns.map((column) => <th key={column.key} className="px-5 py-4">{column.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => <tr key={row.id} className="hover:bg-bgSoft/60">{columns.map((column) => <td key={column.key} className="px-5 py-4 align-top">{column.render(row)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function FilterRow() {
  return (
    <div className="flex flex-wrap gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <select className="rounded-full border border-slate-200 px-4 py-2 text-slateMuted"><option>Status</option></select>
      <select className="rounded-full border border-slate-200 px-4 py-2 text-slateMuted"><option>Asset</option></select>
      {['24h', '7d', '30d'].map((item) => <button key={item} className="rounded-full bg-bgSoft px-4 py-2 font-semibold text-ink">{item}</button>)}
    </div>
  );
}
