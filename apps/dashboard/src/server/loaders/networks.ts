import { pillarApi } from '../pillar-api-proxy';

const fallbackBindings = { object:'list', url:'/v1/network/bindings', has_more:false, data:[
  { id:'tnb_dev', network:'dev', status:'active', default_validator_id:'val_dev', fallback_validator_id:null, livemode:false },
  { id:'tnb_testnet', network:'testnet', status:'active', default_validator_id:'val_testnet', fallback_validator_id:null, livemode:false },
  { id:'tnb_mainnet', network:'mainnet', status:'paused', default_validator_id:'val_mainnet', fallback_validator_id:'val_backup', livemode:true }
] };
export async function loadNetworkBindings(){ try { return await pillarApi('/network/bindings'); } catch { return fallbackBindings; } }
export async function saveNetworkBinding(body:unknown){ return pillarApi('/network/bindings', { method:'POST', body:JSON.stringify(body) }); }
