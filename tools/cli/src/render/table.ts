export function table(rows:unknown[]){return rows.map(r=>Object.values(r as Record<string,unknown>).join('  ')).join('\n')}
