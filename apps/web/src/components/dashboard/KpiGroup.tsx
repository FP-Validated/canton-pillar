import { TrendStat } from './TrendStat';

export type KpiItem = { label: string; value: string; change: number; points: number[] };

export function KpiGroup({ items }: { items: KpiItem[] }) {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{items.map((item) => <TrendStat key={item.label} {...item} />)}</section>;
}
