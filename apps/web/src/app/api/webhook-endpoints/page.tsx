import type { Metadata } from 'next';
import { ResourcePage } from '@/components/apiref/ResourcePage';

export const metadata: Metadata = { title: 'Webhook Endpoints API | Canton Pillar' };

export default function Page() {
  return <ResourcePage slug="webhook-endpoints" />;
}
