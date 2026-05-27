import { z } from 'zod';

export const NetworkId = z.enum(['devnet', 'testnet', 'mainnet']);
export const NetworkContextValidator = z.object({
  provider_id: z.string(),
  validator_id: z.string(),
  status: z.enum(['active', 'degraded', 'down']),
});
export const NetworkContext = z.object({
  object: z.literal('network_context'),
  current: NetworkId,
  supported: z.array(NetworkId),
  validator: NetworkContextValidator.nullable(),
  livemode: z.boolean(),
});

export type NetworkId = z.infer<typeof NetworkId>;
export type NetworkContext = z.infer<typeof NetworkContext>;
