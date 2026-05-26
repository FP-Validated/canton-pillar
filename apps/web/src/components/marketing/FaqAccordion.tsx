'use client';

import { useState } from 'react';
import { Container } from './Container';
import { Eyebrow } from './Eyebrow';

const faqs = [
  ['Is my data on Canton?', 'Canton Pillar keeps the product API focused on business objects. Asset movements are anchored to the ledger-of-truth model, while operational metadata remains in the API and projection layers.'],
  ['How do I bring my own validator?', 'Use the customer-validator mode when your institution must operate validator infrastructure while Canton Pillar runs the API control plane.'],
  ['How are secrets stored?', 'API keys and webhook secrets are scoped by environment, rotated through administrative workflows, and never shown after creation.'],
  ['What happens if a webhook delivery fails?', 'Pillar retries signed webhook deliveries with idempotent event identifiers so receivers can safely process duplicates.'],
  ['What is an operation?', 'An operation is the traceable record for asynchronous work such as validation, settlement, reconciliation, or retry handling.'],
  ['How do I pin an API version?', 'Call the stable /v1 surface and pin SDK versions in your application dependencies; breaking changes are introduced on a new versioned API surface.']
];

export function FaqAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <section className="bg-bgSoft py-20">
      <Container>
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-3 text-4xl font-bold tracking-tight text-ink">Questions enterprise teams ask before the first integration.</h2>
        <div className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          {faqs.map(([question, answer], index) => (
            <div key={question}>
              <button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-bold text-ink" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>
                <span>{question}</span>
                <span className="text-accent">{open === index ? '−' : '+'}</span>
              </button>
              {open === index ? <p className="px-6 pb-6 leading-7 text-slateMuted">{answer}</p> : null}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
