import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTVBrowser, enterFullscreen, leaveFullscreen, fullscreenElement } from '../src/fullscreen.js';

test('recognizes TV browser markers without opting desktop or phone browsers into fullscreen', () => {
  for (const agent of ['com.tcl.browser/660067 (Android 12)', 'Mozilla/5.0 (Android TV 11)', 'Tbrowser/2.0 NETTV', 'Mozilla/5.0 SMART-TV', 'Mozilla/5.0 MIBOX4']) assert.equal(isTVBrowser(agent), true);
  for (const agent of ['', 'Mozilla/5.0 (Macintosh) Chrome/120', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36']) assert.equal(isTVBrowser(agent), false);
});

test('starts the fullscreen request synchronously in the click and handles browser rejection', async () => {
  let requested = false;
  const element = { requestFullscreen() { assert.equal(this, element); requested = true; return Promise.resolve(); } };
  const pending = enterFullscreen(element);
  assert.equal(requested, true, 'request must begin before the gesture handler yields');
  assert.equal(await pending, true);
  assert.equal(await enterFullscreen({ requestFullscreen: () => Promise.reject(new Error('Denied')) }), false);
  assert.equal(await enterFullscreen(null), false);
});

test('supports prefixed TV fullscreen methods and exits them safely', async () => {
  let requested = false;
  const element = { webkitRequestFullscreen() { requested = true; } };
  assert.equal(await enterFullscreen(element), true);
  assert.equal(requested, true);
  const doc = { webkitFullscreenElement: element, webkitExitFullscreen() { this.webkitFullscreenElement = null; } };
  assert.equal(fullscreenElement(doc), element);
  assert.equal(await leaveFullscreen(doc), true);
  assert.equal(fullscreenElement(doc), null);
});
