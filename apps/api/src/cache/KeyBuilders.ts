export type CacheScope = { tenantId: string; livemode: boolean };

function scoped(scope: CacheScope, resource: string, id: string): string {
  return `tenant:${scope.tenantId}:livemode:${scope.livemode}:resource:${resource}:id:${id}`;
}

export const balanceKey = (scope: CacheScope, accountId: string, assetId: string) => scoped(scope, 'balance', `${accountId}:${assetId}`);
export const holdingKey = (scope: CacheScope, holdingId: string) => scoped(scope, 'holding', holdingId);
export const operationKey = (scope: CacheScope, operationId: string) => scoped(scope, 'operation', operationId);
export const eventKey = (scope: CacheScope, eventId: string) => scoped(scope, 'event', eventId);
