import type { ReactNode } from 'react';
export function AdminTable<T extends Record<string, unknown>>({ columns, rows, renderActions }: { columns: { key: keyof T | string; label: string }[]; rows: T[]; renderActions?: (row: T) => ReactNode }) {
  if (!rows.length) return <div className="empty">No records returned.</div>;
  return <table className="admin-table"><thead><tr>{columns.map((c) => <th key={String(c.key)}>{c.label}</th>)}{renderActions ? <th>Actions</th> : null}</tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.id ?? i)}>{columns.map((c) => <td key={String(c.key)}>{String(row[c.key] ?? '—')}</td>)}{renderActions ? <td>{renderActions(row)}</td> : null}</tr>)}</tbody></table>;
}
