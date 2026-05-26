export function LoadingState({ label = 'Loading' }: { label?: string }) { return <div role="status">{label}</div>; }
export function EmptyState({ title = 'No data', children }: { title?: string; children?: React.ReactNode }) { return <section><h2>{title}</h2>{children}</section>; }
export function ErrorState({ message = 'Unable to load data' }: { message?: string }) { return <section role="alert"><h2>Something went wrong</h2><p>{message}</p></section>; }
export function TokenBadge({ id }: { id: string }) { return <code>{id}</code>; }
export function DataList({ items }: { items: any[] }) { if (!items.length) return <EmptyState />; return <ul>{items.map((item, i) => <li key={item.id ?? i}><TokenBadge id={String(item.id ?? item.object ?? i)} /></li>)}</ul>; }
export function ResultView({ result, pick = (v: any) => v?.data ?? [] }: { result: any; pick?: (v: any) => any[] }) { if (!result?.ok) return result?.status === 404 ? <EmptyState title="No data" /> : <ErrorState message={result?.error?.message} />; return <DataList items={pick(result.value)} />; }
export function BillingUnavailable({ reason }: { reason: string }) { return <section role="note"><h2>Billing unavailable</h2><p>{reason}</p></section>; }
