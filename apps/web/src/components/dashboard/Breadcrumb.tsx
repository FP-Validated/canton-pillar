import Link from 'next/link';

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slateMuted">
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 ? <span className="text-slate-300">/</span> : null}
          {crumb.href && index < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-accentDark">{crumb.label}</Link>
          ) : (
            <span className="text-ink">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
