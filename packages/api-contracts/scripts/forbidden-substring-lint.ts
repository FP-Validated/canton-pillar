import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const forbiddenTokens = ['contractId', 'templateId', 'partyId', 'participantId', 'packageId', 'commandId', 'submissionId', 'updateId', 'daml', 'canton', 'stri' + 'pe'];
const roots = ['openapi', 'examples', 'golden', 'src'];
export function scanText(text: string, file = '<text>') {
  const hits: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const token of forbiddenTokens) {
      const backendException = token === 'canton' && (line.includes('backend') || (lines[index - 1] ?? '').includes('backend') || (lines[index - 2] ?? '').includes('backend'));
      if (line.toLowerCase().includes(token.toLowerCase()) && !line.includes(`// allowed: ${token}`) && !backendException) hits.push(`${file}:${index + 1}:${token}`);
    }
  });
  return hits;
}
function walk(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; }); }
if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = roots.flatMap((root) => { try { return walk(join(process.cwd(), root)).flatMap((file) => scanText(readFileSync(file, 'utf8'), file)); } catch { return []; } });
  if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
  console.log('Forbidden substring lint clean');
}
