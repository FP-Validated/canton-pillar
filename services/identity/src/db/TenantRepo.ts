import { ulid } from 'ulid';
export class MemoryRepo<T extends {id:string}>{rows=new Map<string,T>(); async get(id:string){return this.rows.get(id)} async list(){return [...this.rows.values()]} async save(row:T){this.rows.set(row.id,row);return row}}
export const makeId=(prefix:string)=>`${prefix}_${ulid()}`;
import type { Tenant } from '../types.js';
export class TenantRepo extends MemoryRepo<Tenant>{async findBySlug(slug:string){return [...this.rows.values()].find(t=>t.slug.toLowerCase()===slug.toLowerCase())} async createTenant(slug:string,display_name:string){const n=new Date();return this.save({id:makeId('ten'),slug,display_name,billing_status:'active',default_environment:'dev',created_at:n,updated_at:n})}}
