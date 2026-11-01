import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
try {
  const page = await browser.newPage();
  await page.goto(process.env.APP_URL || 'http://localhost:5173');
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await page.getByLabel('Google Drive API key').focus();
  await page.keyboard.press('ArrowUp');
  try { assert.equal(await page.getByLabel('Google Drive folder link').evaluate(element => element === document.activeElement), true); console.log('PASS: D-pad leaves text inputs vertically'); }
  catch { failures.push('D-pad must leave the API-key input with ArrowUp'); }
  await page.close();

  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('drive-tv.settings', JSON.stringify({ key: 'fake-key', folder: 'folder_123456' })));
  let release;
  let started;
  const mediaReady = new Promise(resolve => { started = resolve; });
  await context.route('https://www.googleapis.com/drive/v3/files**', async route => {
    if (new URL(route.request().url()).searchParams.has('alt')) {
      await new Promise(resolve => { release = resolve; started(); });
      return route.abort();
    }
    return route.fulfill({ json: { files: [{ id: 'movie_123456', name: 'Baththa (2026).mp4', mimeType: 'video/mp4' }] } });
  });
  const playerPage = await context.newPage();
  await playerPage.goto(process.env.APP_URL || 'http://localhost:5173');
  await playerPage.getByRole('button', { name: 'Play Baththa', exact: true }).click();
  await mediaReady;
  await playerPage.getByRole('button', { name: 'Forward 10 seconds', exact: true }).focus();
  release();
  await playerPage.getByRole('heading', { name: 'This video could not play here' }).waitFor();
  await playerPage.keyboard.press('Escape');
  try { assert.equal(await playerPage.getByRole('dialog', { name: 'Video player' }).count(), 0); console.log('PASS: Back exits playback after a focused control is removed'); }
  catch { failures.push('Back must exit after a playback error removes the focused control'); }
  await context.close();
  assert.deepEqual(failures, []);
} finally { await browser.close(); }
