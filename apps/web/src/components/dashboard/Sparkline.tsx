export function Sparkline({ points, height = 44, width = 140 }: { points: number[]; height?: number; width?: number }) {
  const min = Math.min(...points); const max = Math.max(...points); const span = max - min || 1;
  const coords = points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * width},${height - ((point - min) / span) * (height - 8) - 4}`);
  const area = [`0,${height}`, ...coords, `${width},${height}`].join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Trend sparkline"><polygon points={area} className="fill-accent/10" /><polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-accent" /></svg>;
}
