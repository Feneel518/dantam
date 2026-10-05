import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

// Public-page checks only: no account creation, payments or live messages.
const baseURL = process.env.LANDING_CHECK_URL || 'http://localhost:3000';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const mutations = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.url());
});
const noOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label);
try {
  await page.goto(baseURL);
  await page.getByRole('heading', { level: 1, name: /Great care deserves/ }).waitFor();
  await page.getByRole('button', { name: 'Confirm visit' }).click();
  assert.equal(await page.getByRole('button', { name: 'Confirmed', exact: true }).isDisabled(), true);
  assert.match(await page.locator('.lp-demo-stats').innerText(), /09/);
  await page.getByRole('tab', { name: 'Patient recalls' }).click();
  await page.getByRole('button', { name: 'Prepare reminder' }).click();
  assert.equal(await page.getByText('Preview ready. No message was sent.').isVisible(), true);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  assert.equal(await page.getByRole('button', { name: 'Confirm visit' }).isEnabled(), true);
  await page.getByRole('tab', { name: 'New enquiries' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Patient recalls' }).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab', { name: 'Your website' }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('link', { name: 'Explore clinic website' }).getAttribute('href'), '/demo');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByText('Can I cancel my monthly subscription?', { exact: true }).click();
  assert.equal(await page.locator('details[open]').count(), 1);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Your website', 'New enquiries', 'Patient recalls']) {
      await page.getByRole('tab', { name }).click();
      await noOverflow(`${width}px: ${name}`);
    }
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    if ([1440, 390].includes(width)) await page.screenshot({ path: `test-results/landing-redesign-${width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.lp-btn').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  for (const name of ['Start growing my practice', 'Get started with Growth', 'Get started with Pro', 'Create my free website', 'Create my free workspace', 'Start free']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('heading', { name: 'A good start for your clinic.' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/register');
    await page.goto(baseURL);
    await page.getByRole('heading', { level: 1 }).waitFor();
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back to your practice.' }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, [], 'Demo must not send any mutations');
  writeFileSync('test-results/landing-redesign-check.json', JSON.stringify({ passed: true, widths: [1440, 1024, 768, 390, 320], checks: ['interactive appointment and recall demos', 'reset', 'keyboard tabs', 'FAQ disclosure', 'all signup CTAs', 'sign in', 'reduced motion', 'no overflow', 'no live mutations'], errors }, null, 2));
  console.log('Landing checks passed at 5 widths. Screenshots saved in test-results/.');
} finally {
  await browser.close();
}
