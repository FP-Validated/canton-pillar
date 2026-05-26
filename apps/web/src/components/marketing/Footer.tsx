import Link from 'next/link';
import { Container } from './Container';

const columns = [
  ['Product', [['Dashboard', '/dashboard'], ['API reference', '/api'], ['Get API keys', '/get-api-keys']]],
  ['Docs', [['Documentation', '/docs'], ['API reference', '/api']]],
  ['Resources', [['GitHub', 'https://github.com/FP-Validated/canton-pillar'], ['Prototype dashboard', '/dashboard']]],
  ['Company', [['Canton Pillar', '/'], ['Documentation', '/docs']]]
] as const;

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <Container>
        <div className="grid gap-8 md:grid-cols-4">
          {columns.map(([title, links]) => (
            <div key={title}>
              <h3 className="font-bold text-ink">{title}</h3>
              <ul className="mt-4 space-y-3 text-sm">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-slateMuted hover:text-accent">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slateMuted md:flex-row">
          <span>© {new Date().getFullYear()} Canton Pillar.</span>
          <span>Prototype — not for production use.</span>
        </div>
      </Container>
    </footer>
  );
}
