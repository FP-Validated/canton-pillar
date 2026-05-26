import { z } from 'zod';

export const Livemode = z.boolean();
export const Timestamp = z.string().datetime({ offset: true });
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const Metadata = z.record(z.string(), z.string()).superRefine((value, ctx) => {
  const entries = Object.entries(value);
  if (entries.length > 50) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'metadata supports at most 50 keys' });
  for (const [key, item] of entries) {
    if (key.length < 1 || key.length > 40) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'metadata key length must be 1..40' });
    if (key.includes('[') || key.includes(']')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'metadata keys must not contain brackets' });
    if (item.length > 500) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'metadata value length must be 0..500' });
  }
});

export const ExpandParameter = z.array(z.string().refine((value) => !value.includes('..') && value.split('.').length <= 3)).max(5);

export const ListEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({
  object: z.literal('list'),
  url: z.string(),
  has_more: z.boolean(),
  data: z.array(item),
});

export const PaginationParams = z.object({
  limit: z.number().int().min(1).max(100).default(10).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
});

export const AuthorizationHeader = z.string().regex(/^Bearer\s+\S+$/);
export const PillarVersionHeader = z.string().regex(/^\d{4}-\d{2}-\d{2}(\.[a-z][a-z0-9-]*)?$/);
export const IdempotencyKeyHeader = z.string().min(1).max(255);
export const PillarRequestIdHeader = z.string();
export const PillarModeHeader = z.enum(['test', 'live']);

export const HealthEnvelope = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  api_version: z.string(),
  timestamp: Timestamp,
});
