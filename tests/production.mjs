// Runs against an isolated production build, or APP_URL after deployment.
// Google/TMDB are intercepted: no real film, credential or quota is exercised.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build, preview } from 'vite';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let server;
if (!process.env.APP_URL) {
  await build({ envFile: false, base: '/drivetv/', define: {
    'import.meta.env.VITE_GOOGLE_DRIVE_API_KEY': JSON.stringify('fake-production-key'),
    'import.meta.env.VITE_GOOGLE_DRIVE_FOLDER': JSON.stringify('production_folder_123'),
    'import.meta.env.VITE_TMDB_READ_TOKEN': JSON.stringify('fake-production-token'),
  }, build: { outDir: '.test-dist' }, logLevel: 'error' });
  server = await preview({ base: '/drivetv/', build: { outDir: '.test-dist' }, preview: { host: '127.0.0.1', port: 5176, strictPort: true } });
}
const url = process.env.APP_URL || 'http://127.0.0.1:5176/drivetv/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://www.googleapis.com/**', route => route.fulfill({ json: { files: [
    { id: 'movie_123456', name: '<img src=x onerror="window.__xss=1">.mp4', mimeType: 'video/mp4' },
  ] } }));
  await context.route('https://api.themoviedb.org/**', route => route.fulfill({ json: { results: [] } }));
  const evalProbe = new URL('security-eval-probe.js', url).href;
  await context.route(evalProbe, route => route.fulfill({ contentType: 'text/javascript', body:
    "try { new Function('return 42')(); window.__evalBlocked = false; } catch(error) { window.__evalBlocked = error.name === 'EvalError'; }",
  }));
  await page.goto(url);
  // The public source also works without deployment credentials.
  if (await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).click();
    await page.getByLabel('Google Drive folder link').fill('production_folder_123');
    await page.getByLabel('Google Drive API key').fill('fake-production-key');
    await page.getByRole('button', { name: 'Open library', exact: true }).click();
  }
  await page.locator('.movie-title').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).count(), 0);
  assert.equal(await page.locator('.profile').count(), 0);
  assert.ok((await page.locator('.movie-title').textContent()).includes('<img'));
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('[onerror]').count(), 0, 'movie names must remain text');
  // A browser-loaded script exercises CSP; DevTools page.evaluate can bypass eval CSP.
  await page.evaluate(src => new Promise((resolve, reject) => {
    const probe = document.createElement('script');
    probe.src = src; probe.onload = resolve; probe.onerror = reject;
    document.head.append(probe);
  }), evalProbe);
  assert.equal(await page.evaluate(() => window.__evalBlocked), true, 'production CSP must block JavaScript string evaluation');
  await page.getByRole('button', { name: 'Credits', exact: true }).click();
  const logo = page.getByRole('img', { name: 'TMDB', exact: true });
  await logo.waitFor();
  const logoUrl = await logo.getAttribute('src');
  assert.equal(new URL(logoUrl, url).pathname, new URL('brand/tmdb.svg', url).pathname);
  assert.equal((await context.request.get(new URL(logoUrl, url).href)).status(), 200);
  await page.keyboard.press('Escape');
  await page.goto(new URL('compat.html?sample=1', url).href);
  const back = page.getByRole('link', { name: '← Back to Drive TV' });
  assert.equal(new URL(await back.getAttribute('href'), url).pathname, new URL(url).pathname);
  assert.equal((await context.request.get(new URL('vendor/libmedia/avplayer.js', url).href)).status(), 200);
  assert.equal((await context.request.get(new URL('vendor/libmedia/wasm/decode/eac3.wasm', url).href)).status(), 200);
  assert.equal((await context.request.get(new URL('samples/compat-fixture.mkv', url).href)).status(), 200);
  await back.click();
  await page.locator('.movie-title').waitFor();
  assert.deepEqual(errors, []);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/compat.mjs'], {
      stdio: 'inherit', env: { ...process.env, APP_URL: url.replace(/\/$/, '') },
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Production decoder test failed (${code})`)));
  });
  console.log('PASS: production subpath, script injection/eval protection, logo/decoder/sample paths, compatibility Back; no live service calls.');
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
