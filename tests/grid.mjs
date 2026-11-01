import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => localStorage.setItem('drive-tv.settings', JSON.stringify({ folder: 'folder_123456', key: 'fake-key' })));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  await context.route('https://www.googleapis.com/**', route => route.fulfill({ json: { files: Array.from({ length: 8 }, (_, index) => ({ id: `movie_12345${index}`, name: `Movie ${index + 1} (2026).mp4`, mimeType: 'video/mp4' })) } }));
  const page = await context.newPage();
  await page.goto(process.env.APP_URL || 'http://localhost:5173/');
  const cards = page.locator('.movie-card');
  await cards.first().waitFor();
  for (const [width, height, columns] of [[1920, 1080, 3], [1280, 720, 3], [800, 600, 2], [390, 844, 1]]) {
    await page.setViewportSize({ width, height });
    const first = await cards.first().boundingBox();
    const nextRow = await cards.nth(columns).boundingBox();
    assert.ok(nextRow.y > first.y + first.height, `Cards must wrap after ${columns} columns at ${width}px`);
    assert.equal(await page.locator('.movie-row').evaluate(row => row.scrollWidth <= row.clientWidth + 1), true, 'the collection must not scroll sideways');
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'every card must fit in the viewport');
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await cards.first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await cards.nth(1).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await cards.nth(4).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await cards.nth(1).evaluate(element => element === document.activeElement), true);
  if (process.env.SCREENSHOT_PATH) {
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; const grid = document.querySelector('.movie-row'); window.scrollTo(0, grid.getBoundingClientRect().top + window.scrollY - 35); });
    await page.screenshot({ path: `${process.env.SCREENSHOT_PATH}-grid.png` });
  }
  console.log('PASS: wrapping 3/2/1-column cards, no sideways scrolling, and grid arrow navigation.');
} finally { await browser.close(); }
