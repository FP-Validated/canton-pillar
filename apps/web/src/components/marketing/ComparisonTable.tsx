import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

const rows = [
  ['Who runs participant', 'Canton Pillar team', 'Customer infrastructure team', 'Customer platform team'],
  ['Who runs control plane', 'Canton Pillar team', 'Canton Pillar team', 'Customer platform team'],
  ['Who handles upgrades', 'Managed by Canton Pillar', 'Joint upgrade window', 'Customer-managed with runbooks'],
  ['SLA', 'Managed service target', 'Shared responsibility target', 'Customer-defined target'],
  ['Regulatory posture', 'Fastest path for pilots', 'Validator stays under customer control', 'Maximum infrastructure control'],
  ['Time to first call', 'Minutes', 'Same day after validator pairing', 'Planned deployment window']
];

const modes = ['hosted', 'customer-validator', 'self-hosted'];

export function ComparisonTable() {
  return (
    <section className="py-20">
      <Container>
        <Eyebrow>Deployment modes</Eyebrow>
        <h2 className="mt-3 text-4xl font-bold tracking-tight text-ink">Choose the operating model without changing the API surface.</h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-bgSoft text-xs uppercase tracking-wide text-slateMuted">
              <tr>
                <th className="px-6 py-4">Question</th>
                {modes.map((mode) => <th key={mode} className="px-6 py-4 font-mono text-ink">{mode}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([label, hosted, validator, selfHosted]) => (
                <tr key={label}>
                  <td className="px-6 py-4 font-semibold text-ink">{label}</td>
                  <td className="px-6 py-4 text-slateMuted">{hosted}</td>
                  <td className="px-6 py-4 text-slateMuted">{validator}</td>
                  <td className="px-6 py-4 text-slateMuted">{selfHosted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
