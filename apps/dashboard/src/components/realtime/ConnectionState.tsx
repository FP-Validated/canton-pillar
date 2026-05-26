export function ConnectionState({ state }: { state: 'online' | 'reconnecting' }) {
  return <span aria-live="polite" data-state={state}>{state === 'online' ? 'online' : 'reconnecting'}</span>;
}
