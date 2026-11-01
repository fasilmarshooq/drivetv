import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const title = 'An Official Movie Name Long Enough to Wrap Across Several Lines';
const clip = readFileSync(new URL('./fixtures/playback.mp4', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    localStorage.setItem('drive-tv.settings', JSON.stringify({ folder: 'folder_123456', key: 'fake-key' }));
    localStorage.setItem('drive-tv.progress', JSON.stringify({ movie_123456: { time: 20, duration: 60, updated: 1 } }));
  });
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://www.googleapis.com/**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('alt')) return route.fulfill({ body: clip, contentType: 'video/mp4' });
    return route.fulfill({ json: { files: url.searchParams.get('q').startsWith("'child_123456'")
      ? [{ id: 'movie_123456', name: 'www_source - An Extremely Long Encoded Movie Filename With Many Unwanted Words (2026) 720p.mp4', mimeType: 'video/mp4' }]
      : [{ id: 'child_123456', name: 'Official Movie', mimeType: 'application/vnd.google-apps.folder' }] } });
  });
  await context.route('https://api.themoviedb.org/**', route => route.fulfill({ json: { results: [{ id: 1234, title, poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg' }] } }));
  await context.route('https://image.tmdb.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#35495e"/></svg>' }));
  const page = await context.newPage();
  await page.goto(process.env.APP_URL || 'http://localhost:5173/');
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 5000 });
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const restart = await page.getByRole('button', { name: 'Play from the beginning', exact: true }).boundingBox();
    const next = await page.getByRole('heading', { name: 'Continue watching', exact: true }).boundingBox();
    assert.ok(restart.y + restart.height + 16 <= next.y, `Restart overlaps the collection at ${viewport.width}×${viewport.height}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  if (process.env.SCREENSHOT_PATH) {
    await page.getByRole('button', { name: 'Play from the beginning', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SCREENSHOT_PATH}-library.png` });
  }
  await page.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 5000 });
  await page.getByLabel('Search your library').fill('Official Movie');
  assert.equal(await page.locator('.movie-card').count(), 1);
  await page.getByLabel('Search your library').fill('www source');
  assert.equal(await page.locator('.movie-card').count(), 1, 'the original filename remains searchable');
  await page.getByLabel('Search your library').fill('');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('dialog', { name: 'Movie details' }).getByRole('heading', { name: title, exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const restart = page.getByRole('button', { name: 'Play from the beginning', exact: true });
  await restart.scrollIntoViewIfNeeded();
  assert.equal(await restart.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === element || element.contains(hit);
  }), true, 'restart must be clickable above the layout');
  await restart.click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.1);
  assert.ok(await page.locator('video').evaluate(video => video.currentTime < 3), 'restart must ignore saved progress');
  await page.locator('.player-header strong').getByText(title, { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Credits', exact: true }).click();
  await page.getByRole('button', { name: 'Check artwork', exact: true }).waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: 'Check artwork', exact: true }).click();
  const check = page.getByRole('dialog', { name: 'Artwork check', exact: true });
  await check.getByText('Working', { exact: true }).first().waitFor();
  assert.equal(await check.getByText('Working', { exact: true }).count(), 2);
  assert.equal((await check.innerText()).includes('fake-key'), false);
  await check.getByRole('button', { name: 'Refresh library', exact: true }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  console.log('PASS: official title/search/details/player, visible restart at TV/laptop/mobile sizes, playback from zero and key-free artwork check.');
} finally { await browser.close(); }
