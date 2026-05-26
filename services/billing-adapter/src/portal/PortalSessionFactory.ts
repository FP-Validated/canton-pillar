import type { ProviderAdapter } from '../providers/ProviderAdapter.js';
export class PortalSessionFactory { constructor(private provider: ProviderAdapter) {} create(customerRef:string) { return this.provider.createPortalUrl(customerRef); } }
