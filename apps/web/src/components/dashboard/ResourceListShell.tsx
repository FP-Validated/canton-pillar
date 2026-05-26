'use client';

import Link from 'next/link';
import { StatusPill, type Status } from '@/components/StatusPill';
import { DataGrid, type ColumnDef } from './DataGrid';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';
import { RowActions } from './RowActions';
import { Toolbar } from './Toolbar';
import { TokenBadge } from './TokenBadge';
import { useMemo, useState } from 'react';

export type ResourceRow = { id: string; status?: string; type?: string; primary?: string; secondary?: string; amount?: string; quantity?: string; created?: string; updated?: string; href: string; raw: unknown };

export function ResourceListShell({ title, section, description, rows, statuses = ['All'], chips = [], noActions = false, children }: { title: string; section: string; description: string; rows: ResourceRow[]; statuses?: string[]; chips?: string[]; noActions?: boolean; children?: React.ReactNode }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = JSON.stringify(row.raw).toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesStatus = status === 'All' || row.status === status || row.type === status.toLowerCase();
    return matchesSearch && matchesStatus;
  }), [rows, search, status]);
  const columns: ColumnDef<ResourceRow>[] = [
    { header: 'ID', sortable: (row) => row.id, cell: (row) => <Link href={row.href} className="font-mono text-xs font-black text-accentDark"><TokenBadge>{row.id}</TokenBadge></Link> },
    { header: 'Type', sortable: (row) => row.type ?? '', cell: (row) => <span className="font-mono text-xs text-slateMuted">{row.type ?? row.primary ?? 'resource'}</span> },
    { header: 'Primary', sortable: (row) => row.primary ?? '', cell: (row) => <span className="font-semibold text-ink">{row.primary ?? row.secondary ?? '—'}</span> },
    { header: 'Amount', align: 'right', sortable: (row) => Number(row.amount ?? row.quantity ?? 0), cell: (row) => <span className="font-mono text-xs">{row.amount ?? row.quantity ?? '—'}</span> },
    { header: 'Status', sortable: (row) => row.status ?? '', cell: (row) => row.status ? <StatusPill status={row.status as Status} /> : '—' },
    { header: 'Updated', sortable: (row) => row.updated ?? row.created ?? '', cell: (row) => <span className="text-xs text-slateMuted">{row.updated ?? row.created ?? '—'}</span> },
    ...(noActions ? [] : [{ header: '', align: 'right' as const, cell: () => <RowActions /> }])
  ];
  return <div className="space-y-5"><PageHeader title={title} description={description} breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: section }]} />{children}<Toolbar search={search} onSearch={setSearch} statuses={statuses} status={status} onStatus={setStatus} chips={chips} onChip={setStatus} resultCount={filtered.length} /><DataGrid rows={filtered} columns={columns} emptyState={<EmptyState title="No records found" body="Adjust filters or search terms to inspect more illustrative data." />} /></div>;
}
