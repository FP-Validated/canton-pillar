import type { Role } from '@pillar/security';
export type User={id:string;google_sub:string;email:string;display_name?:string;picture_url?:string;status:'active'|'disabled'|'deleted';last_login_at?:Date;created_at:Date;updated_at:Date};
export type Tenant={id:string;slug:string;display_name:string;config_tenant_id?:string;billing_status:string;default_environment:'dev'|'testnet'|'mainnet';created_at:Date;updated_at:Date};
export type Membership={id:string;tenant_id:string;user_id:string;role:Role;status:'active'|'invited'|'disabled';created_at:Date;updated_at:Date;accepted_at?:Date;invited_at?:Date};
export type Invitation={id:string;tenant_id:string;email:string;role:Exclude<Role,'super_admin'>;token_hash:string;status:'pending'|'accepted'|'expired'|'revoked';expires_at:Date;created_at:Date;invited_by_user_id?:string};
export const now=()=>new Date();
