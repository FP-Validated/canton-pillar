import { z } from 'zod';
import { Timestamp } from './common.js';

export const PortalUrlResponse = z.object({ object:z.literal('billing_portal_url'), url:z.string().url(), expires_at:Timestamp });
