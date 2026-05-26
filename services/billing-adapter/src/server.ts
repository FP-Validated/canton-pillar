import { MockProvider } from './providers/MockProvider.js';
export function boot() { return { status:'ok', provider:new MockProvider() }; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify({ service:'billing-adapter', status:boot().status }));
