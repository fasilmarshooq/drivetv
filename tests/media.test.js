import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movieInfo } from '../src/media.js';

const file = { name: 'www.site_source - Encoded Name (2026) 720p.mkv' };
test('uses the matched TMDB title while retaining the original file metadata', () => {
  const info = movieInfo(file, { title: 'Official Movie Name' });
  assert.equal(info.title, 'Official Movie Name');
  assert.equal(info.year, '2026');
  assert.equal(info.resolution, '720p');
  assert.equal(info.format, 'MKV');
});
test('keeps the filename title when TMDB has no usable name', () => {
  for (const metadata of [null, {}, { title: '' }, { title: '   ' }, { title: 42 }]) {
    assert.equal(movieInfo(file, metadata).title, 'www site source - Encoded Name');
  }
});
