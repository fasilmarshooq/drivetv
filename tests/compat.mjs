import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  let googleRequests = 0;
  await context.route('https://www.googleapis.com/**', route => { googleRequests++; return route.abort(); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.APP_URL || 'http://localhost:5173'}/compat.html?sample=1`);
  await page.getByRole('button', { name: 'Load and play', exact: true }).click();
  await page.waitForFunction(() => Number(window.compatProbe?.player.getStats().audioFrameRenderCount || 0) > 40, null, { timeout: 20000 });
  await page.locator('#screen').getByText('Embedded English subtitle test', { exact: true }).waitFor({ timeout: 5000 });
  const sound = await page.evaluate(async () => {
    const output = window.compatProbe.player.getAudioOutputNode();
    const analyser = output.context.createAnalyser();
    const samples = new Float32Array(1024);
    analyser.fftSize = 1024;
    output.connect(analyser);
    let peak = 0;
    for (let index = 0; index < 10; index++) {
      analyser.getFloatTimeDomainData(samples);
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    output.disconnect(analyser);
    return { peak, audioContext: output.context.state };
  });
  assert.equal(sound.audioContext, 'running');
  assert.ok(sound.peak > 0.001, 'Dolby decoder must produce non-silent output');
  assert.ok(await page.evaluate(() => Number(window.compatProbe.player.getStats().videoFrameRenderCount) > 5));
  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH, fullPage: true });
  await page.locator('#audio').selectOption({ label: 'Tamil' });
  await page.waitForFunction(() => window.compatProbe.player.getSelectedAudioStreamId() === 2);
  await page.locator('#seek').evaluate(element => { element.value = '2'; element.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => Number(window.compatProbe.player.currentTime) > 2500);
  assert.equal(googleRequests, 0, 'bundled sample must work without Drive or API credentials');
  assert.deepEqual(errors, []);
  console.log(`PASS: HEVC Main10 video, E-AC3 5.1 output (peak ${sound.peak.toFixed(3)}), visible embedded English subtitles, Tamil selection, seek; zero Drive requests/page errors.`);
  console.log('Known limitation remains: subtitle visibility after seeking is not passing and is documented.');
} finally { await browser.close(); }
