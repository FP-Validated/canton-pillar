import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function continueWithGoogle() {
  'use server';
  redirect('/signup/start');
}

export default function LoginPage() {
  if (cookies().has('pillar_session')) {
    redirect('/dashboard');
  }

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Returning user</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Sign in to Canton Pillar</h1>
      <p className="text-slateMuted">Use Google OAuth to access your tenant dashboard. Canton Pillar never asks for a password.</p>
      <form action={continueWithGoogle}>
        <button className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accentDark">
          Continue with Google
        </button>
      </form>
    </section>
  );
}
