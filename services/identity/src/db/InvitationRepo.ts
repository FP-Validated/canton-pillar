import { ulid } from 'ulid';
export class MemoryRepo<T extends {id:string}>{rows=new Map<string,T>(); async get(id:string){return this.rows.get(id)} async list(){return [...this.rows.values()]} async save(row:T){this.rows.set(row.id,row);return row}}
export const makeId=(prefix:string)=>`${prefix}_${ulid()}`;
import type { Invitation } from '../types.js';
export class InvitationRepo extends MemoryRepo<Invitation>{async findByTokenHash(token_hash:string){return [...this.rows.values()].find(i=>i.token_hash===token_hash)}}
