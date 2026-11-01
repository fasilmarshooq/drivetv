import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const calls = new Map();
  let mediaRequests = 0;
  let releaseImages;
  const imagesReady = new Promise(resolve => { releaseImages = resolve; });
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('drive-tv.settings', JSON.stringify({ folder: 'folder_123456', key: 'fake-key' }));
    Object.hasOwn = undefined;
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return this.src.includes('image.tmdb.org') ? Promise.reject(new DOMException('Browser decode quirk', 'EncodingError')) : original.call(this);
    };
  });
  await context.route('https://www.googleapis.com/drive/v3/files**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has('alt')) { mediaRequests++; return route.abort(); }
    const folder = params.get('q').match(/^'([^']+)' in parents/)[1];
    const files = folder === 'folder_123456' ? [
      { id: 'baththa_123456', name: 'baththa', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'unknown_123456', name: 'No Such Movie', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'broken_123456', name: 'Broken Movie', mimeType: 'application/vnd.google-apps.folder' },
      { id: 'fallback_123456', name: 'Poster Only', mimeType: 'application/vnd.google-apps.folder' },
    ] : folder === 'baththa_123456' ? [
      { id: 'movie_a', name: 'Baththa (2026) 720p HEVC.mkv', mimeType: 'video/x-matroska' },
      { id: 'movie_b', name: 'Baththa (2026) Alternate.mp4', mimeType: 'video/mp4' },
    ] : [{ id: folder, name: folder === 'broken_123456' ? 'Broken (2025).mp4' : folder === 'fallback_123456' ? 'Poster (2025).mp4' : 'Unknown (2025).mp4', mimeType: 'video/mp4' }];
    return route.fulfill({ json: { files } });
  });
  await context.route('https://api.themoviedb.org/**', route => {
    const query = new URL(route.request().url()).searchParams.get('query');
    calls.set(query, (calls.get(query) || 0) + 1);
    assert.ok(['baththa', 'No Such Movie', 'Broken Movie', 'Poster Only'].includes(query), 'only containing folder names should be searched');
    const results = query === 'No Such Movie' ? [] : [{ id: query === 'baththa' ? 1515692 : 99, title: query === 'baththa' ? 'Baththa' : query, poster_path: query === 'Broken Movie' ? '/broken-poster.jpg' : '/poster.jpg', backdrop_path: query === 'baththa' ? '/backdrop.jpg' : '/broken.jpg' }];
    return route.fulfill({ json: { results } });
  });
  await context.route('https://image.tmdb.org/**', async route => {
    if (/\/broken(?:-poster)?\.jpg$/.test(route.request().url())) return route.abort();
    await imagesReady;
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#31485c"/></svg>' });
  });
  await page.goto(process.env.APP_URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Baththa', exact: true }).waitFor();
  await page.locator('.hero-art .movie-artwork').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.hero-art > span').count(), 1, 'default title art should remain while the image is loading');
  releaseImages();
  await page.locator('.hero-art.has-artwork').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.hero-art .movie-artwork').getAttribute('src'), 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
  await page.waitForFunction(() => [...document.querySelectorAll('.movie-card')].filter(card => card.textContent.includes('Baththa')).every(card => card.querySelector('.movie-artwork')?.naturalWidth > 0));
  await page.addStyleTag({ content: '.card-art { aspect-ratio: auto !important; }' });
  assert.ok((await page.locator('.card-art').first().boundingBox()).height > 100, 'loaded card artwork must retain its height without CSS aspect-ratio support');
  const unknown = page.getByRole('button', { name: 'Open Unknown', exact: true });
  const broken = page.getByRole('button', { name: 'Open Broken Movie', exact: true });
  assert.equal(await unknown.locator('.movie-artwork').count(), 0);
  await page.waitForFunction(() => [...document.querySelectorAll('.movie-card')].find(card => card.textContent.includes('Broken'))?.querySelector('.title-art > span')?.textContent === 'Broken Movie');
  assert.equal(await broken.locator('.movie-artwork').count(), 0);
  await page.getByRole('button', { name: 'Open Poster Only', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Open Poster Only', exact: true }).locator('.has-artwork').waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole('button', { name: 'Open Poster Only', exact: true }).locator('.movie-artwork').getAttribute('src'), 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(calls.get('baththa'), 1, 'two encodes in the same folder should share one lookup');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('dialog', { name: 'Movie details' }).locator('.movie-artwork').waitFor();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('.hero-art .movie-artwork').waitFor();
  assert.deepEqual([...calls.values()], [1, 1, 1, 1], 'reloading should reuse successful and missing-match cache entries');
  await page.getByRole('button', { name: 'Credits', exact: true }).click();
  const credits = page.getByRole('dialog', { name: 'Credits' });
  await credits.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.', { exact: true }).waitFor();
  await credits.getByRole('img', { name: 'TMDB', exact: true }).evaluate(image => image.decode());
  await page.keyboard.press('Escape');
  assert.equal(mediaRequests, 0);
  assert.deepEqual(pageErrors, []);
  await context.close();

  const loose = await browser.newContext();
  await loose.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await loose.addInitScript(() => localStorage.setItem('drive-tv.settings', JSON.stringify({ folder: 'folder_123456', key: 'fake-key' })));
  let looseLookups = 0;
  await loose.route('https://www.googleapis.com/**', route => route.fulfill({ json: { files: [{ id: 'loose_movie', name: 'Loose (2025).mp4', mimeType: 'video/mp4' }] } }));
  await loose.route('https://api.themoviedb.org/**', route => { looseLookups++; return route.abort(); });
  const loosePage = await loose.newPage();
  await loosePage.goto(process.env.APP_URL || 'http://localhost:5173');
  await loosePage.getByRole('heading', { name: 'Loose', exact: true }).waitFor();
  assert.equal(await loosePage.locator('.hero-art .movie-artwork').count(), 0);
  assert.equal(await loosePage.locator('.hero-art > span').textContent(), 'Loose');
  assert.equal(looseLookups, 0);
  console.log('PASS: folder artwork in hero/cards/details, one lookup per folder, reload cache, default art for root/missing/broken images, TMDB credits; no movie downloads.');
} finally { await browser.close(); }
