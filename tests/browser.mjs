// Run with a local Chrome installation and PLAYWRIGHT_MODULE if Playwright is external.
// MEDIA_FIXTURE points to a small MP4 test clip; credentials here are deliberately fake.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const sample = { id: 'movie_123456', name: 'Baththa (2026) 720p.mp4', mimeType: 'video/mp4', size: '1449276646' };
const clip = process.env.MEDIA_FIXTURE ? readFileSync(process.env.MEDIA_FIXTURE) : null;
await context.route('https://api.themoviedb.org/**', route => route.fulfill({ json: { results: [] } }));
await context.route('https://www.googleapis.com/drive/v3/files**', async route => {
  const url = new URL(route.request().url());
  if (url.searchParams.get('alt') === 'media') {
    if (clip) {
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      if (!range) return route.fulfill({ body: clip, contentType: 'video/mp4', headers });
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : clip.length - 1, clip.length - 1);
      if (start >= clip.length) return route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${clip.length}` } });
      return route.fulfill({ status: 206, body: clip.subarray(start, end + 1), contentType: 'video/mp4', headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${clip.length}` } });
    }
    return route.abort();
  }
  const insideChild = url.searchParams.get('q')?.startsWith("'child_123456' in parents");
  return route.fulfill({ json: { files: insideChild ? [sample] : [{ id: 'child_123456', name: 'Movies', mimeType: 'application/vnd.google-apps.folder' }] }, headers: { 'Access-Control-Allow-Origin': '*' } });
});
try {
  await page.goto(process.env.APP_URL || 'http://localhost:5173/');
  assert.equal(await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).isVisible(), true, 'welcome must offer a clear way to connect');
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
  await page.getByLabel('Google Drive folder link').fill('folder_123456');
  await page.getByLabel('Google Drive API key').fill('test-key');
  await page.getByRole('button', { name: 'Open library', exact: true }).click();
  await page.getByRole('heading', { name: 'Baththa', exact: true }).waitFor();
  await page.getByLabel('Search your library').fill('missing movie');
  assert.equal(await page.getByText('No matching videos').isVisible(), true);
  await page.getByLabel('Search your library').fill('');
  const play = page.getByRole('button', { name: 'Play Baththa', exact: true });
  await play.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Details');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'Movie details' }).waitFor();
  await page.keyboard.press('Escape');
  await play.click();
  await page.getByRole('dialog', { name: 'Video player' }).waitFor();
  if (process.env.MEDIA_FIXTURE) {
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1, null, { timeout: 15000 });
    await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
    assert.equal(await page.locator('video').evaluate(video => video.paused), true);
    await page.getByRole('button', { name: 'Forward 10 seconds', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 1, null, { timeout: 5000 });
  } else {
    await page.getByRole('heading', { name: 'This video could not play here' }).waitFor();
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: 'Video player' }).count(), 0);
  // Closing restores focus on the next animation frame, after React removes inert.
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-hero-play]'), null, { timeout: 2000 });
  await page.reload();
  await page.getByRole('heading', { name: 'Baththa', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).count(), 0);
  assert.equal(await page.locator('.profile').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('PASS: connect, list, search, remote navigation, details, playback/seek, Back/focus, persistence, mobile width; no page errors.');
} finally { await browser.close(); }
