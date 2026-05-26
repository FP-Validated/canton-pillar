import type { Metadata } from 'next';
import { ResourcePage } from '@/components/apiref/ResourcePage';

export const metadata: Metadata = { title: 'Issue Intents API | Canton Pillar' };

export default function Page() {
  return <ResourcePage slug="issue-intents" />;
}
