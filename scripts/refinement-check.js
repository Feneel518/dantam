import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://localhost:3000');
  await page.getByRole('button', { name: 'Explore a clinic website' }).click();
  await page.getByRole('heading', { name: 'Good care. Familiar faces. Happier smiles.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Send appointment request' }).isDisabled(), true);
  await page.screenshot({ path: 'test-results/clinic-demo-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'test-results/clinic-demo-mobile.png', fullPage: true });
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Email address').fill('demo@dantam.local');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD || 'DantamDemo2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your day, in good hands.' }).waitFor();
  for (const route of ['growth', 'connections', 'settings']) {
    await page.goto(`http://localhost:3000/app/${route}`);
    await page.locator('.page-title h1').waitFor();
    if (route === 'connections') {
      await page.getByText('Step-by-step setup', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Test connection', exact: true }).isDisabled(), true);
    }
    if (route === 'growth') {
      await page.getByLabel('Where will you share it?').selectOption('instagram');
      assert.match(await page.getByLabel('Tracked booking link').inputValue(), /utm_source=instagram/);
      assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).isDisabled(), true);
    }
    if (route === 'settings') await page.getByText('This browser', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} mobile overflow`);
    await page.screenshot({ path: `test-results/${route}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `test-results/${route}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back to your practice.' }).waitFor();
  assert.equal((await context.request.get('http://localhost:3000/api/workspace')).status(), 401);
  assert.deepEqual(errors, []);
  console.log('Refinement checks passed: clinic demo, responsive growth/setup/settings, campaign links, sessions and logout.');
} finally { await browser.close(); }
