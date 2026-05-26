import { z } from 'zod';
import { Timestamp } from './common.js';

export const CustomerBilling = z.object({ id:z.string().startsWith('cb_'), object:z.literal('customer_billing'), livemode:z.boolean(), tenant_id:z.string(), environment_id:z.string(), plan:z.string().startsWith('plan_').nullable(), status:z.enum(['active','trialing','past_due','disabled','canceled']), tax_region:z.string().nullable().optional(), created:Timestamp, updated:Timestamp });
