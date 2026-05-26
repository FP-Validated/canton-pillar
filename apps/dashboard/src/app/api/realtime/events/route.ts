import { tenantStream } from '../../../../server/sse/tenantStream';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return tenantStream(request); }
