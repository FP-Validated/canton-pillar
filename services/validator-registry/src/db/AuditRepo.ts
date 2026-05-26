import type { Store } from './models.js';
export class AuditRepo { constructor(private store:Store) {} append(row:any){ this.store.audit.push({ ...row, created_at:new Date().toISOString() }); return row; } list(){ return this.store.audit; } }
