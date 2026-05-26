import { NextResponse } from 'next/server';

const apiBaseUrl = () => (process.env.PILLAR_WEB_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1').replace(/\/$/, '');
const signupRedirect = () => process.env.PILLAR_WEB_SIGNUP_REDIRECT ?? '/dashboard';

type OAuthStartResponse = { authorization_url?: string };

export async function GET() {
  const response = await fetch(`${apiBaseUrl()}/auth/oauth/google/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ return_to: signupRedirect() }),
    cache: 'no-store'
  });

  if (!response.ok) {
    return NextResponse.redirect(new URL('/signup?error=oauth_start_failed', 'http://localhost'), 303);
  }

  const body = (await response.json()) as OAuthStartResponse;
  if (!body.authorization_url) {
    return NextResponse.redirect(new URL('/signup?error=oauth_start_failed', 'http://localhost'), 303);
  }

  return NextResponse.redirect(body.authorization_url, 303);
}

export async function POST() {
  return GET();
}
