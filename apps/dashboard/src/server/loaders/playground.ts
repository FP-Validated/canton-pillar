if (process.env.NODE_ENV !== 'test') await import('server-only');
import { defaultPlaygroundOperation, getPlaygroundOperation, loadPlaygroundOpenApi } from '../playground/openapi';

export async function loadPlayground(operationId?: string) {
  const openapi = loadPlaygroundOpenApi();
  const selected = operationId ? getPlaygroundOperation(operationId) : defaultPlaygroundOperation();
  return { operations: openapi.operations, selected: selected ?? defaultPlaygroundOperation() };
}
