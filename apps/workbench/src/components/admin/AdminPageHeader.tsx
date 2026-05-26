import type { ReactNode } from 'react';
export function AdminPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="admin-header"><div><p className="eyebrow">Super admin</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div><div>{actions}</div></header>;
}
