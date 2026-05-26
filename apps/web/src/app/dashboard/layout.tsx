import Link from 'next/link';
import { Sidebar } from '@/components/dashboard/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bgSoft">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex flex-col justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur md:flex-row md:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">Test mode</span>
            <span className="rounded-full bg-bgSoft px-4 py-2 font-mono text-xs font-black text-ink ring-1 ring-slate-200">acct_demo_001</span>
            <input aria-label="Search" placeholder="Search dashboard" className="w-full rounded-full border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-accent md:max-w-md" />
          </div>
          <Link href="/dashboard/intents?q=global" className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white">Search intents</Link>
        </div>
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
