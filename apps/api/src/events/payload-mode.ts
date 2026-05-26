export type PayloadMode = 'thin' | 'snapshot';
export function resolvePayloadMode(endpointConfig?: { payload_mode?: string }, requestMode?: string): PayloadMode {
  const mode = requestMode ?? endpointConfig?.payload_mode ?? 'thin';
  return mode === 'snapshot' ? 'snapshot' : 'thin';
}
