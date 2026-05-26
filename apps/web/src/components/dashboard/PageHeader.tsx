import Link from 'next/link';
import { Breadcrumb, type Crumb } from './Breadcrumb';

export type HeaderAction = { label: string; href: string; icon?: string };

function ActionButton({ action, primary = false }: { action: HeaderAction; primary?: boolean }) {
  return (
    <Link href={action.href} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ${primary ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-slate-200 hover:bg-bgSoft'}`}>
      {action.icon ? <span aria-hidden="true">{action.icon}</span> : null}
      {action.label}
    </Link>
  );
}

export function PageHeader({ title, eyebrow, description, primaryAction, secondaryActions = [], breadcrumbs, badge }: { title: string; eyebrow?: string; description?: string; primaryAction?: HeaderAction; secondaryActions?: HeaderAction[]; breadcrumbs?: Crumb[]; badge?: React.ReactNode }) {
  return (
    <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          {breadcrumbs ? <Breadcrumb crumbs={breadcrumbs} /> : null}
          {eyebrow ? <div className="inline-flex rounded-full bg-bgSoft px-3 py-1 text-xs font-black tracking-[0.18em] text-accentDark">{eyebrow}</div> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-ink">{title}</h1>
            {badge}
          </div>
          {description ? <p className="max-w-3xl text-sm leading-6 text-slateMuted">{description}</p> : null}
        </div>
        {(primaryAction || secondaryActions.length) ? (
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => <ActionButton key={action.label} action={action} />)}
            {primaryAction ? <ActionButton action={primaryAction} primary /> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
