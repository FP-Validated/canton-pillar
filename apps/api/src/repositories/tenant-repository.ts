import { ulid } from 'ulid';
import type { z } from 'zod';
import { AccountSchema, AssetSchema } from '@pillar/api-contracts/schemas';
type Account = z.infer<typeof AccountSchema>; type Asset = z.infer<typeof AssetSchema>;
const now=()=>new Date().toISOString(); const id=(p:string)=>`${p}${ulid()}`;
export class TenantRepository { accounts: Account[]=[]; assets: Asset[]=[];
 createAccount(input:{display_name:string; metadata?:Record<string,string>}, livemode=false){ const a={id:id('acct_'), object:'account' as const, created:now(), livemode, display_name:input.display_name, status:'active' as const, metadata:input.metadata??{}}; this.accounts.push(a); return a; }
 updateAccount(id:string,input:{display_name?:string;metadata?:Record<string,string>}){ const a=this.accounts.find(x=>x.id===id); if(!a)return; Object.assign(a,input); return a; }
 getAccount(id:string){ return this.accounts.find(a=>a.id===id); }
 listAccounts(){ return this.accounts; }
 createAsset(input:{code:string; name:string; scale:number; metadata?:Record<string,string>}, livemode=false){ const a={id:id('asst_'), object:'asset' as const, created:now(), livemode, code:input.code, name:input.name, scale:input.scale, status:'active' as const, transferable:true, redeemable:true, metadata:input.metadata??{}}; this.assets.push(a); return a; }
 updateAsset(id:string,input:Partial<Asset>){ const a=this.assets.find(x=>x.id===id); if(!a)return; Object.assign(a,input); return a; }
 getAsset(id:string){ return this.assets.find(a=>a.id===id); } listAssets(){ return this.assets; }}
export const tenantRepository = new TenantRepository();
