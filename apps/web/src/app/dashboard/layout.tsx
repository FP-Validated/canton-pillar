import { Sidebar } from '@/components/dashboard/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bgSoft">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex flex-col justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur md:flex-row md:items-center">
          <input aria-label="Search" placeholder="Search Canton Pillar resources" className="w-full rounded-full border border-slate-200 px-4 py-3 text-sm outline-none focus:border-accent md:max-w-md" />
          <div className="rounded-full bg-bgSoft px-4 py-3 font-mono text-sm text-ink">acct_demo_001 (livemode: false)</div>
        </div>
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
