import { NextResponse, type NextRequest } from 'next/server';
import { isNetwork } from '@/lib/network';

export function middleware(request: NextRequest) {
  const cookieNetwork = request.cookies.get('pillar-network')?.value;
  const network = isNetwork(cookieNetwork) ? cookieNetwork : 'devnet';
  const requestHeaders = new Headers(request.headers);
  if (request.nextUrl.pathname.startsWith('/api/proxy/')) requestHeaders.set('Pillar-Network', network);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!cookieNetwork) response.cookies.set('pillar-network', 'devnet', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
