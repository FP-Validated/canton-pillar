import type { Metadata } from 'next';
import GetApiKeysPageClient from './GetApiKeysPageClient';

export const metadata: Metadata = { title: 'Get API keys – Canton Pillar' };

export default function GetApiKeysPage() {
  return <GetApiKeysPageClient />;
}
