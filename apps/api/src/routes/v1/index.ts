import type { FastifyInstance } from 'fastify';
import openapi from '@pillar/api-contracts/openapi/pillar-v1.json' assert { type: 'json' };
import { loadConfig } from '../../config.js';
import { accountsRoutes } from './accounts.js'; import { assetsRoutes } from './assets.js'; import { balancesRoutes, holdingsRoutes } from './projection.js'; import { issueIntentsRoutes, redeemIntentsRoutes, transferIntentsRoutes } from './intents.js'; import { eventsRoutes, holdsRoutes, operationsRoutes, webhookEndpointsRoutes, webhookDlqRoutes } from './other.js';
import { p8ApiKeysRoutes } from './api_keys.js'; import { filesRoutes } from './files.js'; import { privacyRoutes } from './privacy.js'; import { authRoutes } from './auth.js'; import { requestLogsRoutes } from './request_logs.js';
import { onboardingRoutes } from './onboarding/index.js';
import { usageRoutes } from './usage.js';
import { invoicesRoutes } from './invoices.js';
import { billingRoutes } from './billing.js';
import { adminNetworkRoutes } from './admin/network/index.js';
import { networkRoutes } from './network/index.js';
export async function v1Routes(s:FastifyInstance){
 s.get('/health', async()=>({status:'ok', object:'health', api_version:loadConfig().apiVersion, deployment_mode:loadConfig().deploymentMode}));
 s.get('/openapi.json', async()=>openapi);
 await s.register(accountsRoutes); await s.register(assetsRoutes); await s.register(balancesRoutes); await s.register(holdingsRoutes); await s.register(issueIntentsRoutes); await s.register(redeemIntentsRoutes); await s.register(transferIntentsRoutes); await s.register(holdsRoutes); await s.register(operationsRoutes); await s.register(eventsRoutes); await s.register(webhookEndpointsRoutes); await s.register(webhookDlqRoutes); await s.register(p8ApiKeysRoutes); await s.register(onboardingRoutes); await s.register(filesRoutes); await s.register(privacyRoutes); await s.register(authRoutes); await s.register(requestLogsRoutes); await s.register(usageRoutes); await s.register(invoicesRoutes); await s.register(billingRoutes); await s.register(adminNetworkRoutes); await s.register(networkRoutes);
}
