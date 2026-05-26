import { ulid } from 'ulid';
import * as F from '@pillar/api-contracts/fixtures';
export const now=()=>new Date().toISOString(); export const nid=(p:string)=>`${p}${ulid()}`;
export const live=(v:any, livemode:boolean)=>({...v, livemode, created: now()});
export const operation=(livemode=false,intent=F.ids.tr,id=nid('op_'))=>live({...F.operation, id, intent, ledger:{backend:'canton', update_reference:'opaque-update-ref', offset:'42'}},livemode);
export const event=(livemode=false)=>live({...F.event,id:nid('evt_'), api_version:'2026-05-26'},livemode);
export const balance=(livemode=false)=>live({...F.balance,id:nid('bal_')},livemode);
export const holding=(livemode=false)=>live({...F.holding,id:nid('hld_')},livemode);
export function intent(kind:'issue'|'redeem'|'transfer', livemode=false, body:any={}) { const base=kind==='issue'?F.issueIntent:kind==='redeem'?F.redeemIntent:F.transferIntent; const prefix=kind==='issue'?'issint_':kind==='redeem'?'redint_':'trint_'; return live({...base,...body,id:body.id??nid(prefix),operation:body.operation??nid('op_'),latest_event:body.latest_event??null,status:'processing',metadata:body.metadata??{}},livemode); }
export const hold=(livemode=false,body:any={})=>live({...F.hold,...body,id:body.id??nid('hold_'),operation:body.operation??nid('op_'),latest_event:body.latest_event??null,status:body.status??'active',metadata:body.metadata??{}},livemode);
