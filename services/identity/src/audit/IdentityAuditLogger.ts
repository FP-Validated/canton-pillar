export class IdentityAuditLogger{events:any[]=[]; async append(event:any){this.events.push({...event,created_at:new Date()})}}
