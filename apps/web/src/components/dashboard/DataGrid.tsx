'use client';

import { useMemo, useState } from 'react';
import { Pagination } from './Pagination';

export type ColumnDef<T> = { header: string; cell: (row: T) => React.ReactNode; sortable?: (row: T) => string | number; align?: 'left' | 'right' | 'center'; width?: string };

export function DataGrid<T>({ columns, rows, emptyState, pageSize = 25 }: { columns: ColumnDef<T>[]; rows: T[]; emptyState?: React.ReactNode; pageSize?: number }) {
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (sortIndex === null || !columns[sortIndex]?.sortable) return rows;
    const sort = columns[sortIndex].sortable!;
    return [...rows].sort((a, b) => {
      const av = sort(a); const bv = sort(b);
      const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return direction === 'asc' ? result : -result;
    });
  }, [columns, direction, rows, sortIndex]);
  const pageCount = Math.ceil(sorted.length / pageSize) || 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const start = sorted.length ? safePage * pageSize + 1 : 0;
  const end = Math.min(sorted.length, safePage * pageSize + pageSize);

  if (!rows.length) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
            <tr>{columns.map((column, index) => <th key={column.header} style={{ width: column.width }} className={`border-b border-slate-200 px-4 py-3 font-black ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}><button type="button" disabled={!column.sortable} onClick={() => { setSortIndex(index); setDirection(sortIndex === index && direction === 'asc' ? 'desc' : 'asc'); }} className="disabled:cursor-default">{column.header}{column.sortable ? ' ↕' : ''}</button></th>)}</tr>
          </thead>
          <tbody>
            {visible.map((row, rowIndex) => <tr key={rowIndex} className="group hover:bg-bgSoft/70">{columns.map((column) => <td key={column.header} className={`border-b border-slate-100 px-4 py-4 align-middle ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}>{column.cell(row)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between px-4 py-3 text-xs font-bold text-slateMuted">
        <span>Showing {start}–{end} of {sorted.length}</span>
        <Pagination page={safePage} pageCount={pageCount} onPage={setPage} />
      </footer>
    </div>
  );
}
