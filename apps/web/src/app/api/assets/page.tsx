import type { Metadata } from 'next';
import { ResourcePage } from '@/components/apiref/ResourcePage';

export const metadata: Metadata = { title: 'Assets API | Canton Pillar' };

export default function Page() {
  return <ResourcePage slug="assets" />;
}
