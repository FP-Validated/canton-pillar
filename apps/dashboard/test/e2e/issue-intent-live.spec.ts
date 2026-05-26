import test from 'node:test';
import assert from 'node:assert/strict';

const forbidden = /contractId|templateId|partyId|packageId|submissionId|commandId|updateId/;

test('dashboard live issue intent flow hides Canton internals', async (t) => {
  process.env.PILLAR_TEST_OIDC_BYPASS = 'true';
  let puppeteer: any;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    t.skip('puppeteer is not installed in this workspace');
    return;
  }

  const baseUrl = process.env.PILLAR_DASHBOARD_URL;
  if (!baseUrl) {
    t.skip('PILLAR_DASHBOARD_URL is required for the live dashboard slice');
    return;
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle2' });
    await page.goto(`${baseUrl}/dashboard/intents/new`, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="amount"], [data-testid="issue-intent-amount"]', { timeout: 10_000 });
    const amount = await page.$('input[name="amount"]') ?? await page.$('[data-testid="issue-intent-amount"]');
    assert.ok(amount);
    await amount.click({ clickCount: 3 });
    await amount.type('100.000000');

    const submit = await page.$('button[type="submit"]') ?? await page.$('[data-testid="submit-issue-intent"]');
    assert.ok(submit);
    await submit.click();

    await page.waitForFunction(() => document.body.innerText.includes('issue_intent.succeeded'), { timeout: 60_000 });
    const rendered = await page.evaluate(() => document.body.innerText);
    assert.match(rendered, /issue_intent\.succeeded/);
    assert.equal(forbidden.test(rendered), false);
  } finally {
    await browser.close();
  }
});
