import { NextRequest, NextResponse } from 'next/server';

const apiBaseUrl = () => (process.env.PILLAR_WEB_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1').replace(/\/$/, '');
const signupRedirect = () => process.env.PILLAR_WEB_SIGNUP_REDIRECT ?? '/dashboard';

type OAuthCallbackResponse = { return_to?: string };
type ErrorResponse = { error?: { code?: string } };

function errorRedirect(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/signup?error=${encodeURIComponent(code)}`, request.url), 303);
}

function parseSessionCookie(setCookie: string | null) {
  return setCookie?.split(',').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('pillar_session='));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');

  if (!code || !state) {
    return errorRedirect(request, 'oauth_callback_failed');
  }

  const callbackUrl = new URL(`${apiBaseUrl()}/auth/oauth/google/callback`);
  callbackUrl.searchParams.set('code', code);
  callbackUrl.searchParams.set('state', state);

  const response = await fetch(callbackUrl, { cache: 'no-store' });
  if (!response.ok) {
    let errorCode = 'oauth_callback_failed';
    try {
      const body = (await response.json()) as ErrorResponse;
      errorCode = body.error?.code ?? errorCode;
    } catch {
      // Keep the generic code when the API returns a non-JSON error.
    }
    return errorRedirect(request, errorCode);
  }

  const body = (await response.json()) as OAuthCallbackResponse;
  const destination = body.return_to ?? signupRedirect();
  const redirect = NextResponse.redirect(new URL(destination, request.url), 303);
  const sessionCookie = parseSessionCookie(response.headers.get('set-cookie'));

  if (!sessionCookie) {
    return errorRedirect(request, 'oauth_callback_failed');
  }

  redirect.headers.append('set-cookie', sessionCookie);
  return redirect;
}
