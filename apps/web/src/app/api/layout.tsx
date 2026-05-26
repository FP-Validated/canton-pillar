import type { ReactNode } from 'react';
import { ApiRefSidebar } from '@/components/apiref/Sidebar';

export default function ApiLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-6 py-8">
      <ApiRefSidebar />
      <main className="min-w-0 flex-1">
        <div className="max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
