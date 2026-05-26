import { redirect } from 'next/navigation';

const errorCopy: Record<string, { title: string; body: string }> = {
  invalid_oauth_state: {
    title: 'Your sign-in session expired',
    body: 'Start again so Google can issue a fresh authorization response.'
  },
  hosted_domain_not_allowed: {
    title: 'This Google account is not allowed',
    body: 'Use an account from an approved hosted domain for this Canton Pillar workspace.'
  },
  oauth_callback_failed: {
    title: 'Google sign-in could not be completed',
    body: 'The authorization response was rejected. Start again or contact your workspace administrator.'
  }
};

function allowedHostedDomains() {
  return (process.env.PILLAR_OAUTH_ALLOWED_HOSTED_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

async function continueWithGoogle() {
  'use server';
  redirect('/signup/start');
}

export default function SignupPage({ searchParams }: { searchParams?: { error?: string } }) {
  const domains = allowedHostedDomains();
  const errorCode = searchParams?.error;
  const error = errorCode ? errorCopy[errorCode] ?? errorCopy.oauth_callback_failed : null;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Google OAuth sign-up</p>
        <h1 className="text-4xl font-bold tracking-tight text-ink md:text-5xl">Start with your Google account.</h1>
        <p className="text-lg leading-8 text-slateMuted">
          Canton Pillar uses Google OAuth only. We never ask for a password, and the server stores the authenticated session in an
          HTTP-only cookie for the dashboard.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-950">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{errorCode}</p>
          <h2 className="mt-2 text-2xl font-bold">{error.title}</h2>
          <p className="mt-2 text-sm leading-6">{error.body}</p>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">OAuth scopes</h2>
          <p className="mt-3 text-sm leading-6 text-slateMuted">
            We request OpenID Connect identity scopes: openid, email, and profile. API access is granted by your tenant role after sign-in.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Hosted domain</h2>
          <p className="mt-3 text-sm leading-6 text-slateMuted">
            {domains.length > 0
              ? `Only Google accounts from ${domains.join(', ')} can sign in to this workspace.`
              : 'No hosted-domain restriction is configured for this environment.'}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Terms</h2>
          <p className="mt-3 text-sm leading-6 text-slateMuted">
            By continuing, you agree to the Canton Pillar terms placeholder and your organization&apos;s access policy.
          </p>
        </div>
      </div>

      <form action={continueWithGoogle}>
        <button className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accentDark">
          Continue with Google
        </button>
      </form>
    </section>
  );
}
