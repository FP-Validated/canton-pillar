export type DocLink = { title: string; href: string };
export type DocSection = { title: string; links: DocLink[] };

export const docSections: DocSection[] = [
  { title: 'Getting started', links: [
    { title: 'Introduction', href: '/docs/getting-started/introduction' },
    { title: 'Quickstart', href: '/docs/getting-started/quickstart' },
    { title: 'Your first intent', href: '/docs/getting-started/your-first-intent' },
    { title: 'Object model', href: '/docs/getting-started/object-model' },
    { title: 'Deployment modes', href: '/docs/getting-started/deployment-modes' }
  ]},
  { title: 'Concepts', links: ['Accounts','Assets','Balances','Holdings','Intents','Holds','Operations','Events','Ledger of truth','Idempotency','Pagination','Errors','Versioning','Metadata'].map((title) => ({ title, href: `/docs/concepts/${title.toLowerCase().replaceAll(' ', '-')}` })) },
  { title: 'Guides', links: [
    ['Issuing assets','issuing-assets'], ['Transferring funds','transferring-funds'], ['Redeeming','redeeming'], ['Holds and releases','holds-and-releases'], ['Building reliable webhooks','building-reliable-webhooks'], ['Implementing idempotency','implementing-idempotency'], ['Handling errors','handling-errors'], ['Pinning API versions','pinning-api-versions'], ['Switching deployment modes','switching-deployment-modes']
  ].map(([title, slug]) => ({ title, href: `/docs/guides/${slug}` })) },
  { title: 'Architecture', links: ['Overview','Layered runtime','Object boundaries','Ledger source-of-truth','Webhook system','Security model','Observability','Multi-tenancy'].map((title) => ({ title, href: `/docs/architecture/${title.toLowerCase().replaceAll(' ', '-')}` })) },
  { title: 'Operations', links: ['Onboarding a tenant','Provisioning a participant','Rotating secrets','Restoring projections','Replaying webhooks','Migrating templates','Incident response'].map((title) => ({ title, href: `/docs/operations/${title.toLowerCase().replaceAll(' ', '-')}` })) },
  { title: 'Reference', links: [
    ['Glossary','glossary'], ['API resources','api-resources'], ['CLI','cli'], ['Configuration','configuration'], ['Status enums','status-enums'], ['Error codes','error-codes'], ['Event types','event-types']
  ].map(([title, slug]) => ({ title, href: `/docs/reference/${slug}` })) },
  { title: 'Resources', links: ['Changelog','Security','Compliance','FAQ'].map((title) => ({ title, href: `/docs/resources/${title.toLowerCase()}` })) }
];

export const flatDocLinks = [{ title: 'Docs home', href: '/docs' }, { title: 'Getting started', href: '/docs/getting-started' }, ...docSections.flatMap((section) => section.links)];

export function pagerFor(href: string) {
  const index = flatDocLinks.findIndex((link) => link.href === href);
  return {
    prev: index > 0 ? flatDocLinks[index - 1] : undefined,
    next: index >= 0 && index < flatDocLinks.length - 1 ? flatDocLinks[index + 1] : undefined
  };
}
