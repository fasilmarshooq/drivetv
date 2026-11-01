// Exercise deployment defaults in a fresh browser without real credentials or services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  envFile: false,
  define: {
    'import.meta.env.VITE_GOOGLE_DRIVE_API_KEY': JSON.stringify('deployment-drive-key'),
    'import.meta.env.VITE_TMDB_READ_TOKEN': JSON.stringify('deployment-tmdb-token'),
    'import.meta.env.VITE_GOOGLE_DRIVE_FOLDER': JSON.stringify('deployment_folder_123'),
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://www.googleapis.com/**', route => {
    const url = new URL(route.request().url());
    const child = url.searchParams.get('q')?.startsWith("'movie_folder_123' in parents");
    return route.fulfill({ json: { files: child
      ? [{ id: 'movie_123456', name: 'Baththa.mkv', mimeType: 'video/x-matroska' }]
      : [{ id: 'movie_folder_123', name: 'baththa', mimeType: 'application/vnd.google-apps.folder' }] } });
  });
  await context.route('https://api.themoviedb.org/**', route => route.fulfill({ json: { results: [] } }));
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(request));
  await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('heading', { name: 'Baththa', exact: true }).waitFor({ timeout: 6000 });
  const drive = requests.find(request => request.url().startsWith('https://www.googleapis.com/'));
  assert.equal(drive.headers()['x-goog-api-key'], 'deployment-drive-key');
  assert.ok(new URL(drive.url()).searchParams.get('q').startsWith("'deployment_folder_123' in parents"));
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.startsWith('https://api.themoviedb.org/')));
  const tmdb = requests.find(request => request.url().startsWith('https://api.themoviedb.org/'));
  assert.equal(tmdb.headers().authorization, 'Bearer deployment-tmdb-token');
  assert.equal(await page.evaluate(() => localStorage.getItem('drive-tv.settings')), null, 'defaults need no saved browser settings');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByLabel('Google Drive API key').inputValue(), 'deployment-drive-key');
  await page.getByLabel('Google Drive API key').fill('override-key');
  await page.getByRole('button', { name: 'Save and reload', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByLabel('Google Drive API key').inputValue(), 'override-key');
  console.log('PASS: fresh-device deployment defaults, Drive folder/key, TMDB token, no settings write, remembered device override.');
} finally {
  await browser.close();
  await server.close();
}
