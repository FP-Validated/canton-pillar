'use client';

import { StatusPill, type Status } from '@/components/StatusPill';
import { ActivityFeed } from './ActivityFeed';
import { AttributesGrid } from './AttributesGrid';
import { DataGrid } from './DataGrid';
import { JsonViewer } from './JsonViewer';
import { PageHeader } from './PageHeader';
import { RelatedPanel } from './RelatedPanel';
import { Tabs } from './Tabs';
import { Timeline } from './Timeline';
import { TokenBadge } from './TokenBadge';
import { getEventsForObject, operations, holds, webhookDeliveries } from '@/lib/mockData';

export function ResourceDetailShell({ section, id, status, record, attributes, related = [] }: { section: string; id: string; status?: string; record: unknown; attributes: { label: string; value: React.ReactNode; copy?: string }[]; related?: { label: string; href: string; meta?: string }[] }) {
  const events = getEventsForObject(id);
  const relatedOps = operations.filter((op) => op.resource_id === id || op.intent_id === id);
  const activeHolds = holds.filter((hold) => hold.holding_id === id);
  const deliveries = webhookDeliveries.filter((delivery) => delivery.endpoint_id === id);
  return <div className="space-y-5"><PageHeader title={id} breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: section, href: `/dashboard/${section.toLowerCase()}` }, { label: id }]} badge={<><TokenBadge>{id}</TokenBadge>{status ? <StatusPill status={status as Status} /> : null}</>} secondaryActions={[{ label: 'Confirm', href: '#' }, { label: 'Cancel', href: '#' }, { label: 'Open API', href: '/api' }]} />
    <Tabs tabs={[{ label: 'Details', content: <div className="grid gap-5 lg:grid-cols-3"><div className="space-y-5 lg:col-span-2"><AttributesGrid items={attributes} />{relatedOps[0] ? <Timeline direction="horizontal" steps={relatedOps[0].transitions} /> : null}{activeHolds.length ? <DataGrid rows={activeHolds} columns={[{ header: 'Hold', cell: (row) => row.id }, { header: 'Amount', cell: (row) => row.amount }, { header: 'Status', cell: (row) => <StatusPill status={row.status} /> }]} /> : null}{deliveries.length ? <DataGrid rows={deliveries} columns={[{ header: 'Delivery', cell: (row) => row.id }, { header: 'HTTP', cell: (row) => row.http_status }, { header: 'Status', cell: (row) => <StatusPill status={row.status} /> }]} /> : null}</div><RelatedPanel title="Related" links={related} /></div> }, { label: 'Activity', content: <ActivityFeed items={events.map((event) => ({ ...event, title: event.type }))} /> }, { label: 'Events', content: <DataGrid rows={events} emptyState={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slateMuted">No related events.</div>} columns={[{ header: 'Event', cell: (row) => row.id }, { header: 'Type', cell: (row) => row.type }, { header: 'Created', cell: (row) => row.created }]} /> }, { label: 'Raw JSON', content: <JsonViewer value={record} /> }]} />
  </div>;
}
