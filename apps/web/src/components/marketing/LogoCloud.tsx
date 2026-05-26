import { Container } from './Container';

const names = ['Treasury Atlas', 'Cantonyx Bank', 'Meridian Custody', 'Pyrite Settlement', 'Greenway Capital', 'Solstice Markets'];

export function LogoCloud() {
  return (
    <section className="border-y border-slate-200 bg-bgSoft/50 py-10">
      <Container>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {names.map((name) => (
            <div key={name} className="flex h-20 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <svg viewBox="0 0 220 48" className="h-10 w-full px-4" role="img" aria-label={`${name} illustrative wordmark`}>
                <text x="110" y="29" textAnchor="middle" className="fill-ink font-sans text-[18px] font-bold tracking-tight">
                  {name}
                </text>
              </svg>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-medium uppercase tracking-wide text-slateMuted">Illustrative; not real customers.</p>
      </Container>
    </section>
  );
}
