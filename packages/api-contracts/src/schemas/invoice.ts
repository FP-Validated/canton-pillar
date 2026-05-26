import { z } from 'zod';
import { ListEnvelope, Timestamp } from './common.js';

export const InvoiceStatusEnum = z.enum(['draft','open','paid','void','uncollectible','disputed']);
export const InvoiceLine = z.object({ id:z.string(), object:z.literal('invoice_line'), meter:z.string(), description:z.string(), quantity:z.string(), unit_amount:z.string(), amount:z.string(), currency:z.string(), period_start:Timestamp, period_end:Timestamp });
export const Invoice = z.object({ id:z.string().startsWith('inv_'), object:z.literal('invoice'), livemode:z.boolean(), customer_billing:z.string().startsWith('cb_'), status:InvoiceStatusEnum, currency:z.string(), subtotal:z.string(), total:z.string(), period_start:Timestamp, period_end:Timestamp, hosted_invoice_url:z.string().url().nullable().optional(), lines:z.array(InvoiceLine), dispute:z.object({ status:z.string(), evidence:z.record(z.any()), submitted_at:Timestamp }).nullable().optional(), created:Timestamp, updated:Timestamp });
export const InvoiceListResponse = ListEnvelope(Invoice);
export const InvoiceDisputeRequest = z.object({ reason:z.string().min(1), evidence:z.record(z.any()).default({}) });
