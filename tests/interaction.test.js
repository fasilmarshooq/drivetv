import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextControl } from '../src/navigation.js';
import { readSaved, writeSaved, progressEntry } from '../src/storage.js';

const box = (id, x, y) => ({ id, left: x, top: y, width: 120, height: 50 });
test('remote arrows stay in the current row before moving diagonally', () => {
  const origin = box('play', 50, 100);
  const candidates = [box('below', 65, 210), box('right', 240, 100), box('left', -100, 100)];
  assert.equal(nextControl(origin, candidates, 'ArrowRight')?.id, 'right');
  assert.equal(nextControl(origin, candidates, 'ArrowDown')?.id, 'below');
  assert.equal(nextControl(origin, candidates, 'ArrowUp'), null);
});

test('records progress and clears a finished movie rather than offering a near-end resume', () => {
  assert.deepEqual(progressEntry(120, 600, 10), { time: 120, duration: 600, updated: 10 });
  assert.equal(progressEntry(592, 600, 10), null);
  assert.equal(progressEntry(NaN, 600, 10), null);
});

test('private-mode storage failure does not crash the app', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(readSaved(storage, 'settings', { folder: '' }), { folder: '' });
  assert.equal(writeSaved(storage, 'settings', { folder: 'value' }), false);
  assert.equal(readSaved({ getItem: () => '{invalid' }, 'settings', null), null);
});

test('persists settings as JSON and reads saved progress back', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(writeSaved(storage, 'progress', { movie: { time: 123 } }), true);
  assert.deepEqual(readSaved(storage, 'progress', {}), { movie: { time: 123 } });
});
