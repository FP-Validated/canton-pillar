import { z } from 'zod';
import { ListEnvelope, Timestamp } from './common.js';

export const PricingPlan = z.object({ id:z.string().startsWith('plan_'), object:z.literal('pricing_plan'), name:z.string(), status:z.enum(['draft','published','retired']), currency:z.string(), meter_config:z.record(z.object({ unit:z.string(), included:z.string().optional(), unit_amount:z.string().optional() })), provider_price_map:z.record(z.string()), effective_from:Timestamp, effective_to:Timestamp.nullable().optional(), created:Timestamp, updated:Timestamp });
export const PricingPlanListResponse = ListEnvelope(PricingPlan);
export const PricingPlanPublishRequest = z.object({ name:z.string(), currency:z.string(), meter_config:z.record(z.any()), provider_price_map:z.record(z.string()).default({}), effective_from:Timestamp });
