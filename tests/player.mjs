// Real browser playback with a synthetic 60-second clip and fake Drive responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const clip = readFileSync(new URL('./fixtures/playback.mp4', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  async function configure(context) {
    await context.addInitScript(() => localStorage.setItem('drive-tv.settings', JSON.stringify({ folder: 'folder_123456', key: 'fake-key' })));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://api.themoviedb.org/**', route => route.fulfill({ json: { results: [] } }));
    await context.route('https://www.googleapis.com/**', route => {
      if (!new URL(route.request().url()).searchParams.has('alt')) {
        return route.fulfill({ json: { files: [{ id: 'movie_123456', name: 'Remote playback test.mp4', mimeType: 'video/mp4' }] } });
      }
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      if (!range) return route.fulfill({ body: clip, contentType: 'video/mp4', headers });
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : clip.length - 1, clip.length - 1);
      if (start >= clip.length) return route.fulfill({ status: 416, headers: { ...headers, 'Content-Range': `bytes */${clip.length}` } });
      return route.fulfill({ status: 206, body: clip.subarray(start, end + 1), contentType: 'video/mp4', headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${clip.length}` } });
    });
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await configure(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://localhost:5173/');
  const play = page.getByRole('button', { name: 'Play Remote playback test', exact: true });
  await play.click();
  const screen = page.getByRole('dialog', { name: 'Video player' });
  const video = page.locator('video');
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
  await video.evaluate(element => { element.pause(); element.currentTime = 20; });
  await page.locator('.player-actions').getByRole('button', { name: 'Fullscreen', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 30) < 0.2, null, { timeout: 2500 });
  assert.equal(await video.evaluate(element => element.paused), true, 'seeking must preserve pause');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 20) < 0.2);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('video').paused);
  // Controls should disappear instead of reserving space around the picture.
  await page.waitForFunction(() => document.querySelector('.player-header').inert, null, { timeout: 5000 });
  await page.getByRole('button', { name: 'Back to library', exact: true }).waitFor({ state: 'hidden' });
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: `${process.env.SCREENSHOT_PATH}-playing.png` });
  assert.equal(await page.getByRole('button', { name: 'Back to library', exact: true }).isVisible(), false);
  await page.keyboard.press('ArrowUp');
  await page.getByRole('button', { name: 'Pause playback', exact: true }).waitFor();
  assert.equal(await video.evaluate(element => element.paused), false, 'peeking controls must not pause');
  await screen.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('video').paused);
  const bounds = await page.locator('.video-stage').boundingBox();
  assert.deepEqual(bounds, { x: 0, y: 0, width: 1440, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.player-header')).opacity === '1');
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: `${process.env.SCREENSHOT_PATH}-paused.png` });
  await page.locator('.player-actions').getByRole('button', { name: 'Fullscreen', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.fullscreenElement?.classList.contains('player-screen'), null, { timeout: 2500 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await screen.count(), 1, 'first Back exits fullscreen without closing the movie');
  await page.keyboard.press('Escape');
  assert.equal(await screen.count(), 0);
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-hero-play]'));
  await play.click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 19);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await context.close();
  for (const denyFullscreen of [false, true]) {
    const tv = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android TV 11) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 com.tcl.browser/1.0' });
    await configure(tv);
    if (denyFullscreen) await tv.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Fullscreen denied', 'NotAllowedError'));
    });
    const tvPage = await tv.newPage();
    const tvErrors = [];
    tvPage.on('pageerror', error => tvErrors.push(error.message));
    await tvPage.goto(process.env.APP_URL || 'http://localhost:5173/');
    await tvPage.getByRole('button', { name: 'Play Remote playback test', exact: true }).click();
    await tvPage.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
    if (!denyFullscreen) {
      await tvPage.waitForFunction(() => document.fullscreenElement?.classList.contains('player-screen'), null, { timeout: 2500 });
      await tvPage.keyboard.press('Escape');
      await tvPage.waitForFunction(() => !document.fullscreenElement);
    } else assert.equal(await tvPage.evaluate(() => document.fullscreenElement), null);
    await tvPage.keyboard.press('Escape');
    assert.deepEqual(tvErrors, []);
    await tv.close();
  }
  console.log('PASS: TV fullscreen on Play, denied-fullscreen playback fallback, and direct remote ±10s from a focused control, OK play/pause, auto-hide/peek, edge-to-edge video, fullscreen Back, resume and focus; no live Google requests.');
} finally { await browser.close(); }
