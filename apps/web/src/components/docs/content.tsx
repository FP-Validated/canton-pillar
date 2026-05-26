import Link from 'next/link';
import { ApiTable } from './ApiTable';
import { Callout } from './Callout';
import { CodeBlock } from './CodeBlock';
import { Diagram } from './Diagram';
import { KeyValueList } from './KeyValueList';
import { Steps } from './Steps';

export const architectureBase = 'https://github.com/FP-Validated/canton-pillar/blob/main/docs/Architecture/';

export function slugify(title: string) { return title.toLowerCase().replaceAll(' ', '-'); }

export const ids = ['acct_', 'asst_', 'bal_', 'hldg_', 'issint_', 'redint_', 'trint_', 'hold_', 'op_', 'evt_', 'we_', 'ak_', 'req_'];

export function ConceptContent({ title }: { title: string }) {
  const slug = slugify(title);
  const object = title.toLowerCase();
  const prefix = title === 'Accounts' ? 'acct_' : title === 'Assets' ? 'asst_' : title === 'Balances' ? 'bal_' : title === 'Holdings' ? 'hldg_' : title === 'Holds' ? 'hold_' : title === 'Operations' ? 'op_' : title === 'Events' ? 'evt_' : 'req_';
  return <>
    <h2 id="definition">Definition</h2><p>{title} describe the public {object} surface Canton Pillar exposes to product teams. The API keeps identifiers opaque, stable, and prefixed so callers can log them safely without learning ledger implementation details. Each resource is shaped for reconciliation: it has a creation time, a livemode flag, metadata for customer references, and links to operations or events that prove how it changed.</p>
    <Callout variant="info" title="Public boundary">Docs intentionally use Pillar IDs such as <code>{prefix}example</code>. Ledger internals stay behind the runtime boundary.</Callout>
    <h2 id="lifecycle">Lifecycle</h2><p>A {object} record begins when an authenticated request is accepted or when a projection observes a committed ledger change. Mutable fields move through explicit statuses; immutable fields remain stable for audit and replay. Read models are eventually projected, so API clients should prefer operation and event links for proof rather than assuming a list response is the final word.</p>
    <ApiTable columns={[{header:'Stage',accessor:'stage'},{header:'What happens',accessor:'body'},{header:'Client action',accessor:'client'}]} rows={[{stage:'Created',body:'The request is validated and assigned a prefixed ID.',client:'Persist the ID and request key.'},{stage:'Processing',body:'The command runtime validates balances, policy, and tenant configuration.',client:'Poll the operation or wait for webhooks.'},{stage:'Projected',body:'Read models catch up and list/detail endpoints show the new state.',client:'Reconcile using events and metadata.'}]} />
    <h2 id="example">Example JSON</h2><CodeBlock language="json">{`{\n  "id": "${prefix}example",\n  "object": "${slug}",\n  "status": "active",\n  "livemode": false,\n  "metadata": { "customer_ref": "treasury-ops" },\n  "created": "2026-05-26T10:15:00Z"\n}`}</CodeBlock>
    <h2 id="operations-events">Related operations and events</h2><p>Operations are the durable work records for mutations. Events are the delivery-friendly facts emitted after state changes. For {object}, expect operation names that mirror the action and event names that describe the resulting state, such as created, updated, succeeded, failed, or canceled.</p>
    <h2 id="pitfalls">Common pitfalls</h2><ul><li>Do not parse ID bodies; only the prefix is meaningful.</li><li>Do not treat projection lag as failure. Use operations for command status.</li><li>Keep metadata small, searchable, and free of secrets.</li></ul>
    <h2 id="related">Related</h2><ul><li><Link href="/docs/reference/api-resources">API resources</Link></li><li><Link href="/docs/concepts/events">Events</Link></li><li><Link href={`/api/${slug}`}>API reference for {title}</Link></li></ul>
  </>;
}

export function GuideContent({ title }: { title: string }) {
  const action = title.toLowerCase();
  return <>
    <h2 id="scenario">Scenario</h2><p>This guide shows how an operator implements {action} without coupling product code to ledger plumbing. The pattern is the same across mutations: validate the business input, send one intent request with an idempotency key, observe the operation, and reconcile the emitted event into your own system of record.</p>
    <h2 id="prerequisites">Prerequisites</h2><ul><li>An active tenant in one of the supported deployment modes.</li><li>A restricted API key with the required write and read scopes.</li><li>A stable customer reference stored in metadata for reconciliation.</li></ul>
    <Steps steps={[{title:'Prepare the request',body:'Choose the smallest resource set needed for the action and generate a request key scoped to the business action.'},{title:'Submit the intent',body:<CodeBlock language="bash">{`curl https://api.cantonpillar.example/v1/transfer_intents \\\n  -H "Authorization: Bearer $PILLAR_KEY" \\\n  -H "Idempotency-Key: req_${slugify(title)}_001" \\\n  -d amount=2500 -d asset=asst_usdc -d destination=acct_treasury`}</CodeBlock>},{title:'Track the operation',body:'Read the returned operation ID until it reaches a terminal status or consume the corresponding event webhook.'},{title:'Reconcile locally',body:'Store the final resource, event ID, and request key together so retries and support investigations have one trace.'}]} />
    <h2 id="verification">Verification</h2><ApiTable columns={[{header:'Check',accessor:'check'},{header:'Expected result',accessor:'result'}]} rows={[{check:'Operation status',result:'succeeded or a documented failure code'},{check:'Event delivery',result:'evt_ record delivered to every enabled endpoint'},{check:'Read model',result:'balances, holdings, or intent detail reflect the final state'}]} />
    <h2 id="troubleshooting">Troubleshooting</h2><Callout variant="warning" title="Retry safely">Retry only with the same idempotency key for the same semantic request. A new key means a new operation.</Callout>
    <h2 id="common-pitfalls">Common pitfalls</h2><ul><li>Submitting a second request instead of reading the first operation.</li><li>Using metadata as a secret store.</li><li>Assuming webhooks arrive in user-interface order rather than event creation order.</li></ul>
    <h2 id="next-steps">Next steps</h2><p>Review <Link href="/docs/guides/implementing-idempotency">implementing idempotency</Link>, <Link href="/docs/guides/building-reliable-webhooks">building reliable webhooks</Link>, and the matching API reference.</p>
  </>;
}

export function ArchitectureContent({ title }: { title: string }) {
  return <>
    <h2 id="overview">Overview</h2><p>{title} describes the runtime boundary that lets Canton Pillar present a developer-friendly API while preserving ledger-grade traceability. Requests enter through an API edge, are normalized into commands, committed through the ledger-backed runtime, projected into query models, and delivered as webhooks. Each layer has a narrow job so failures can be retried without losing audit context.</p>
    <Diagram title="Layered runtime">{`API edge\n  | validate, authenticate, version\nCommand runtime\n  | intent state machine and idempotency\nLedger source of truth\n  | durable settlement facts\nProjection layer\n  | customer-facing reads\nWebhook dispatcher\n  | signed delivery and replay`}</Diagram>
    <h2 id="responsibilities">Responsibilities</h2><KeyValueList items={[{term:'API edge',description:'Owns authentication, version headers, request shaping, and customer-safe errors.'},{term:'Command runtime',description:'Turns public intents into ledger-traceable operations and prevents duplicate effects.'},{term:'Projection',description:'Builds read models optimized for accounts, assets, balances, holdings, intents, and events.'},{term:'Webhook system',description:'Delivers signed event facts with retry, replay, and dead-letter handling.'}]} />
    <h2 id="invariants">Invariants</h2><Callout variant="success" title="Operations must be traceable">Every mutation has an operation, every terminal state has an event, and every replay preserves the original event identity.</Callout><ul><li>Public objects never expose ledger implementation identifiers.</li><li>Projection rebuilds are allowed to change freshness, not truth.</li><li>Tenant configuration is isolated by mode and environment.</li></ul>
    <h2 id="tradeoffs">Tradeoffs</h2><p>The architecture favors explicit state machines over implicit side effects. That creates more visible objects, but it gives support, compliance, and customer engineering teams a shared vocabulary for diagnosing failures and proving outcomes.</p>
  </>;
}

export function OperationContent({ title }: { title: string }) {
  return <>
    <h2 id="pre-checks">Pre-checks</h2><ul><li>Confirm the tenant, environment, and deployment mode.</li><li>Capture current operation, event, and projection health.</li><li>Open a change record with rollback owner and customer communication path.</li></ul>
    <h2 id="action-steps">Action steps</h2><Steps steps={[{title:'Freeze risky writes',body:'Pause non-essential automation for the affected tenant or endpoint.'},{title:'Run the controlled action',body:'Apply the smallest operational command and record the returned operation or job identifier.'},{title:'Watch projections and webhooks',body:'Confirm lag returns to normal and failed deliveries are either retried or moved to a queue for review.'}]} />
    <h2 id="rollback">Rollback</h2><p>Rollback means returning the public API and read models to a safe state, not deleting evidence. Prefer compensating operations, restoring projections from a known checkpoint, or disabling an endpoint while preserving events for replay.</p>
    <h2 id="post-checks">Post-checks</h2><ApiTable columns={[{header:'Area',accessor:'area'},{header:'Check',accessor:'check'}]} rows={[{area:'API',check:'No elevated 4xx or 5xx responses for the tenant.'},{area:'Projection',check:'Lag is within the documented SLO.'},{area:'Webhook',check:'No unexpected dead-letter growth.'},{area:'Audit',check:'Change record links all operation and event IDs.'}]} />
  </>;
}
