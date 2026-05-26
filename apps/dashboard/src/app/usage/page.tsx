import { UsageSummary } from '../../components/billing/UsageSummary';
import { InvoiceList } from '../../components/billing/InvoiceList';
import { PortalLink } from '../../components/billing/PortalLink';
import { loadBilling } from '../../server/loaders/billing';
export default async function UsagePage() { const data = await loadBilling(); if (data.billing_disabled) return <main><h1>Billing disabled</h1><p>This deployment mode does not use hosted billing.</p></main>; return <main><h1>Usage and billing</h1><UsageSummary summary={data.summary}/><InvoiceList invoices={data.invoices}/><PortalLink admin={true} url={data.portalUrl}/></main>; }
