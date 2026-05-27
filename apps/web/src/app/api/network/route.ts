import { NextResponse } from 'next/server';
import { isNetwork, networkFromCookie, type NetworkContext } from '@/lib/network';

const maxAge = 60 * 60 * 24 * 365;

export async function GET(request: Request) {
  const current = networkFromCookie(request.headers.get('cookie'));
  return NextResponse.json({ object: 'network_context', current, supported: ['devnet', 'testnet', 'mainnet'], validator: null, livemode: current === 'mainnet' } satisfies NetworkContext);
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const network = typeof (body as { network?: unknown }).network === 'string' ? (body as { network: string }).network : undefined;
  if (!isNetwork(network)) return NextResponse.json({ error: { code: 'invalid_network', message: 'Unsupported network.' } }, { status: 400 });
  const response = NextResponse.json({ object: 'network_context', current: network, supported: ['devnet', 'testnet', 'mainnet'], validator: null, livemode: network === 'mainnet' } satisfies NetworkContext);
  response.cookies.set('pillar-network', network, { path: '/', sameSite: 'lax', maxAge });
  return response;
}
