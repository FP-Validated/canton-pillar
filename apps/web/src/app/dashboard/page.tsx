import { OverviewClient } from '@/components/dashboard/OverviewClient';
import { PageHeader } from '@/components/dashboard/PageHeader';

export default function DashboardPage() {
  return <div className="space-y-6"><PageHeader eyebrow="CONTROL CENTER" title="Overview" description="Enterprise operating console for illustrative Pillar IDs, intent lifecycle, webhook delivery, and projection health." primaryAction={{ label: 'New transfer intent', href: '/dashboard/intents' }} secondaryActions={[{ label: 'Open API reference', href: '/api/transfer-intents' }]} /><OverviewClient /></div>;
}
