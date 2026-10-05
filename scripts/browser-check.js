import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text()); });
try {
  await page.goto('http://localhost:3000');
  await page.getByRole('heading', { name: /Great care deserves/ }).waitFor();
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true, animations:'disabled' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email address').fill('demo@dantam.local');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD || 'DantamDemo2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your day, in good hands.' }).waitFor();
  await page.getByRole('heading',{name:'Appointment diary'}).waitFor();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true, animations:'disabled' });
  for (const label of ['Appointments','Website requests','Patients','Your website','Google reviews','Growth plan','Automations','Connections','Billing','Settings']) {
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: label, exact: label !== 'Website requests' }).click();
    await page.locator('.page-title h1').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`${label} desktop overflow`);
  }
  await page.getByRole('navigation', {name:'Workspace'}).getByRole('button',{name:'Patients',exact:true}).click();
  if (!await page.getByText('Browser Example',{exact:true}).count()) {
    await page.getByRole('button',{name:'Add patient',exact:true}).click();
    await page.getByLabel('Patient name').fill('Browser Example');
    await page.getByLabel('Mobile number').fill('9999000888');
    await page.getByRole('button',{name:'Save patient',exact:true}).click();
  }
  await page.getByText('Browser Example',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Your website',exact:true}).click();
  await page.getByLabel('Headline').fill('Your smile, thoughtfully cared for.');
  await page.getByRole('button',{name:'Save website details'}).click();
  await page.locator('[data-sonner-toast]').getByText('Website details saved').waitFor();
  await page.screenshot({path:'test-results/website-desktop.png',fullPage:true,animations:'disabled'});
  const preview = page.frameLocator('iframe[title="Clinic website preview"]');
  await preview.getByRole('heading',{name:'Your smile, thoughtfully cared for.'}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();
  await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'mobile dashboard overflow');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Appointments',exact:true}).click();
  await page.getByRole('button',{name:'Book appointment',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({path:'test-results/booking-mobile.png',fullPage:true,animations:'disabled'});
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.goto('http://localhost:3000');
  await page.getByRole('heading',{name:/Great care deserves/}).waitFor();
  await page.screenshot({path:'test-results/landing-mobile.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'mobile landing overflow');
  assert.deepEqual(errors,[]);
  writeFileSync('test-results/browser-check.json',JSON.stringify({passed:true,checks:['desktop landing','dashboard','all workspace routes','patient creation','website edit and preview','390px mobile layout','modal Escape behaviour'],consoleErrors:errors},null,2));
  console.log('Browser checks passed. Screenshots saved to test-results/.');
} catch(error) { await page.screenshot({path:'test-results/browser-failure.png',fullPage:true}); throw error; } finally { await browser.close(); }
