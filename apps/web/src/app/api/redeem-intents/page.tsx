import type { Metadata } from 'next';
import { ResourcePage } from '@/components/apiref/ResourcePage';

export const metadata: Metadata = { title: 'Redeem Intents API | Canton Pillar' };

export default function Page() {
  return <ResourcePage slug="redeem-intents" />;
}
