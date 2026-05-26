import type { ReactNode } from 'react';
import { Sidebar } from '@/components/docs/Sidebar';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[1500px] bg-white"><Sidebar />{children}</div>;
}
