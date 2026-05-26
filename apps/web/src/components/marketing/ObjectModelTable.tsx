import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

const objects = [
  ['issue_intent', 'Creates newly issued asset units under issuer-controlled policy.', 'issint_'],
  ['transfer_intent', 'Moves asset value between accounts through an intent lifecycle.', 'trint_'],
  ['redeem_intent', 'Returns asset value to the issuer under policy controls.', 'redint_'],
  ['hold', 'Reserves value for downstream settlement or review.', 'hold_'],
  ['holding', 'Projected account-level asset balance available to the API.', 'hldg_'],
  ['asset', 'Configured asset with issuance, transfer, and redemption policy.', 'asst_'],
  ['operation', 'Traceable asynchronous runtime operation.', 'op_'],
  ['event', 'Thin webhook event emitted from state transitions.', 'evt_'],
  ['webhook_endpoint', 'Configured delivery target with signing and retry policy.', 'we_']
];

export function ObjectModelTable() {
  return (
    <section className="bg-bgSoft py-20">
      <Container>
        <Eyebrow>Object model</Eyebrow>
        <h2 className="mt-3 text-4xl font-bold tracking-tight text-ink">Stable objects, predictable identifiers, no internal leakage.</h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-white text-xs uppercase tracking-wide text-slateMuted">
              <tr>
                <th className="px-6 py-4">Object</th>
                <th className="px-6 py-4">What it represents</th>
                <th className="px-6 py-4">ID prefix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {objects.map(([object, description, prefix]) => (
                <tr key={object} className="hover:bg-bgSoft/70">
                  <td className="px-6 py-4 font-mono font-semibold text-ink">{object}</td>
                  <td className="px-6 py-4 leading-6 text-slateMuted">{description}</td>
                  <td className="px-6 py-4 font-mono font-bold text-accent">{prefix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
