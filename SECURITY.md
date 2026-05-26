# Canton Pillar Security Policy

Pillar handles Canton-backed financial assets. We take security reports seriously.

## Report a vulnerability

Email: **security@pillar.example** (placeholder address; legal/security to replace before public launch).

Please do not file public GitHub issues for vulnerabilities.

For encrypted reports, request a PGP key from the address above.

## What we ask

- Provide a clear technical description.
- Provide reproduction steps where possible.
- Do not exploit beyond confirming the vulnerability.
- Allow 90 days for remediation before public disclosure (standard responsible disclosure window).

## Supported branches

- `main` (current development).
- Tagged releases: latest minor and previous minor.
- Pre-1.0: best-effort.

## What is in scope

- The Pillar codebase in this repository.
- Pillar-operated hosted deployment (when reachable).
- Webhook signature implementation.
- DAR/package signing path.

## What is out of scope

- Canton or Daml SDK vulnerabilities themselves (report to Digital Asset).
- Third-party vendor APIs Pillar integrates with.
- Customer-operated infrastructure in customer-validator or self-hosted deployments.

## Reporting policy

We ask you NEVER share production credentials, customer PII, or live signing keys with any report. Local test artifacts are fine.

## Acknowledgement

Reporters are credited unless they prefer anonymity.
