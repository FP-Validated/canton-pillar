"use client";

import Link from 'next/link';
import { useState } from 'react';
import { StatusPill } from '@/components/StatusPill';

type DeploymentMode = 'hosted' | 'customer-validator' | 'self-hosted';
type Step = 1 | 2 | 3 | 4;

type ApiPrefix = 'secret_test' | 'restricted_test' | 'publishable_test';

interface MockApiKey {
  id: `ak_${string}`;
  name: string;
  prefix: ApiPrefix;
  value: string;
  last4: string;
  status: 'active';
  scopes: string[];
}

const deploymentModes: { value: DeploymentMode; label: string; subtitle: string }[] = [
  {
    value: 'hosted',
    label: 'hosted',
    subtitle: 'We operate the Canton participant for you.'
  },
  {
    value: 'customer-validator',
    label: 'customer-validator',
    subtitle: 'Bring your own validator; Pillar provides the control plane.'
  },
  {
    value: 'self-hosted',
    label: 'self-hosted',
    subtitle: 'Pillar deploys into your cluster and data plane.'
  }
];

const countries = ['US', 'KR', 'GB', 'JP', 'EU', 'SG', 'AU'];
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_BODY_LENGTH = 32;
const EMAIL_REGEX = /.+@.+\..+/;

function generateMockUlid(): string {
  let seed = (Date.now() + Math.floor(Math.random() * 0x100000000)) & 0xffffffff;
  let encoded = '';

  for (let index = 0; index < 26; index += 1) {
    seed = (seed * 48271 + 1013904223) % 0x7fffffff;
    encoded += ULID_ALPHABET[seed % ULID_ALPHABET.length];
  }

  return encoded;
}

function generateRandomBody(length: number): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    out += chars[randomIndex];
  }

  return out;
}

function createMockKeys(): MockApiKey[] {
  const secretBody = generateRandomBody(KEY_BODY_LENGTH);
  const restrictedBody = generateRandomBody(KEY_BODY_LENGTH);
  const publishableBody = generateRandomBody(KEY_BODY_LENGTH);

  return [
    {
      id: `ak_${generateMockUlid()}`,
      name: 'Secret test key',
      prefix: 'secret_test',
      value: `plr_sk_test_${secretBody}`,
      last4: secretBody.slice(-4),
      status: 'active',
      scopes: ['accounts:read', 'intents:write']
    },
    {
      id: `ak_${generateMockUlid()}`,
      name: 'Restricted test key',
      prefix: 'restricted_test',
      value: `plr_rk_test_${restrictedBody}`,
      last4: restrictedBody.slice(-4),
      status: 'active',
      scopes: ['accounts:read']
    },
    {
      id: `ak_${generateMockUlid()}`,
      name: 'Publishable test key',
      prefix: 'publishable_test',
      value: `plr_pk_test_${publishableBody}`,
      last4: publishableBody.slice(-4),
      status: 'active',
      scopes: ['assets:read']
    }
  ];
}

export default function GetApiKeysPageClient() {
  const [step, setStep] = useState<Step>(1);
  const [workspaceName, setWorkspaceName] = useState('');
  const [primaryBusinessEmail, setPrimaryBusinessEmail] = useState('');
  const [country, setCountry] = useState('');
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('hosted');
  const [errors, setErrors] = useState({ workspaceName: '', email: '', country: '' });
  const [apiKeys, setApiKeys] = useState<MockApiKey[]>([]);

  const selectedMode = deploymentModes.find((item) => item.value === deploymentMode);

  const validateStepOne = () => {
    const nextErrors = {
      workspaceName: workspaceName.trim() ? '' : 'Workspace name is required.',
      email: EMAIL_REGEX.test(primaryBusinessEmail) ? '' : 'Enter a valid business email.',
      country: country ? '' : 'Select a country.'
    };
    setErrors(nextErrors);

    return !(nextErrors.workspaceName || nextErrors.email || nextErrors.country);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!validateStepOne()) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (step === 3) {
      setApiKeys(createMockKeys());
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((current) => (current - 1) as Step);
    }
  };

  const canContinue =
    step === 1
      ? Boolean(workspaceName.trim() && EMAIL_REGEX.test(primaryBusinessEmail) && country)
      : step === 2
        ? Boolean(deploymentMode)
        : true;

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-2xl px-6 py-8 pb-28">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Get API keys</p>
          <h1 className="text-3xl font-bold text-ink">Get API keys in 4 steps</h1>
          <p className="text-sm text-slateMuted">Create mock test API keys for your workspace.</p>
        </header>

        <div className="mt-8 flex items-center justify-between text-xs text-slateMuted">
          <p>1—2—3—4</p>
          <p>Step {step} of 4</p>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((item) => {
            const number = item as Step;
            const active = number === step;
            const done = number < step;
            const bar = active ? 'bg-accent' : done ? 'bg-accentDark' : 'bg-slate-200';
            const label = active ? 'text-accent' : done ? 'text-accentDark' : 'text-slateMuted';

            return (
              <div key={item} className="space-y-2">
                <div className={`h-2 rounded-full ${bar}`} />
                <p className={`text-center text-[11px] font-semibold uppercase ${label}`}>Step {item}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-8">
          {step === 1 && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold text-ink">Workspace</h2>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink">Workspace name</span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Acme Finance"
                  className="w-full rounded-xl border border-slate-200 p-3 text-ink outline-none ring-accent focus:border-accent focus:ring"
                />
                {errors.workspaceName ? <span className="text-sm text-rose-600">{errors.workspaceName}</span> : null}
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink">Primary business email</span>
                <input
                  type="email"
                  value={primaryBusinessEmail}
                  onChange={(event) => setPrimaryBusinessEmail(event.target.value)}
                  placeholder="ops@acme.finance"
                  className="w-full rounded-xl border border-slate-200 p-3 text-ink outline-none ring-accent focus:border-accent focus:ring"
                />
                {errors.email ? <span className="text-sm text-rose-600">{errors.email}</span> : null}
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-ink">Country</span>
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-ink outline-none ring-accent focus:border-accent focus:ring"
                >
                  <option value="">Select country</option>
                  {countries.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                {errors.country ? <span className="text-sm text-rose-600">{errors.country}</span> : null}
              </label>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold text-ink">Deployment mode</h2>
              <div className="space-y-3">
                {deploymentModes.map((mode) => {
                  const checked = deploymentMode === mode.value;

                  return (
                    <label
                      key={mode.value}
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 ${
                        checked ? 'border-accent bg-accent/5' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deployment-mode"
                        value={mode.value}
                        checked={checked}
                        onChange={() => setDeploymentMode(mode.value)}
                        className="mt-1 h-4 w-4 accent-accent"
                      />
                      <span>
                        <p className="font-semibold text-ink">{mode.label}</p>
                        <p className="mt-1 text-sm text-slateMuted">{mode.subtitle}</p>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold text-ink">Review</h2>
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                Test-mode keys will be created.
              </p>

              <div className="rounded-2xl border border-slate-200 bg-bgSoft p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slateMuted">Workspace</h3>
                <dl className="mt-2 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slateMuted">Workspace name</dt><dd className="font-medium text-ink">{workspaceName}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slateMuted">Business email</dt><dd className="font-medium text-ink">{primaryBusinessEmail}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slateMuted">Country</dt><dd className="font-medium text-ink">{country}</dd></div>
                </dl>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-bgSoft p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slateMuted">Deployment mode</h3>
                <p className="mt-2 font-mono text-sm text-ink">{selectedMode?.value}</p>
                <p className="mt-1 text-sm text-slateMuted">{selectedMode?.subtitle}</p>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-6">
              <h2 className="text-xl font-bold text-ink">Keys ready</h2>
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                This is the only time we&apos;ll show the full secret. Copy it now.
              </p>

              <div className="space-y-4">
                {apiKeys.map((key) => (
                  <article key={key.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{key.name}</p>
                        <p className="font-mono text-xs text-accent">{key.id}</p>
                      </div>
                      <StatusPill status={key.status} />
                    </div>

                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3"><dt className="text-slateMuted">Prefix</dt><dd className="font-mono">{key.prefix}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slateMuted">Last4</dt><dd className="font-mono">{key.last4}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slateMuted">Scopes</dt><dd className="flex flex-wrap justify-end gap-1">{key.scopes.map((scope) => <span key={scope} className="rounded-full bg-bgSoft px-2 py-1 text-xs font-semibold text-slateMuted">{scope}</span>)}</dd></div>
                    </dl>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-bgSoft p-3">
                      <code className="break-all font-mono text-xs text-ink">{key.value}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(key.value).catch(() => undefined);
                        }}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accentDark"
                      >
                        Copy
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-bgSoft p-4">
                <h3 className="text-sm font-semibold text-ink">Next steps</h3>
                <ul className="mt-3 space-y-2 text-sm text-accent">
                  <li><Link href="/api/authentication">Authentication docs</Link></li>
                  <li><Link href="/dashboard/api-keys">API keys dashboard</Link></li>
                  <li><Link href="/docs/quickstart">Quickstart guide</Link></li>
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 py-4">
          <Link href="/" className="text-sm font-semibold text-slateMuted hover:text-ink">Cancel</Link>

          <div className="flex gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-ink"
              >
                Back
              </button>
            ) : null}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canContinue}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${
                  canContinue ? 'bg-accent hover:bg-accentDark' : 'cursor-not-allowed bg-slate-300'
                }`}
              >
                Next
              </button>
            ) : null}

            {step === 3 ? (
              <button type="button" onClick={handleNext} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentDark">
                Create keys
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
