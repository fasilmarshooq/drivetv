import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFolderArtwork, ARTWORK_CACHE_KEY } from '../src/tmdb.js';
import * as tmdb from '../src/tmdb.js';

const movie = { id: 1515692, title: 'Baththa', original_title: 'பத்தா', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg' };
const nested = [{ id: 'file-a', name: 'Baththa (2026) 720p x265.mkv', folderName: 'baththa' }];
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
}

test('searches the containing folder name rather than the encoded movie filename', async () => {
  const result = await loadFolderArtwork(nested, { token: 'fake-token', fetcher: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.themoviedb.org');
    assert.equal(parsed.pathname, '/3/search/movie');
    assert.equal(parsed.searchParams.get('query'), 'baththa');
    assert.equal(options.headers.Authorization, 'Bearer fake-token');
    assert.equal(parsed.searchParams.has('api_key'), false);
    return Response.json({ results: [movie] });
  }});
  assert.equal(result['file-a']?.posterUrl, 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.equal(result['file-a']?.backdropUrl, 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
});

test('shares one lookup across videos in the same movie folder and publishes artwork together', async () => {
  let requests = 0;
  const published = [];
  const result = await loadFolderArtwork([...nested, { id: 'file-b', folderName: 'BATHThA' }], {
    token: 'fake-token',
    fetcher: async () => { requests++; return Response.json({ results: [movie] }); },
    onArtwork: (ids, artwork) => published.push({ ids, artwork }),
  });
  assert.equal(requests, 1);
  assert.equal(result['file-a']?.id, 1515692);
  assert.equal(result['file-b']?.id, 1515692);
  assert.deepEqual(published[0]?.ids, ['file-a', 'file-b']);
});

test('root-folder files keep the default artwork without a TMDB request', async () => {
  let requests = 0;
  const result = await loadFolderArtwork([{ id: 'loose-file', name: 'Baththa.mkv', folderName: null }], {
    token: 'fake-token', fetcher: async () => { requests++; throw new Error('Root files must not be searched'); },
  });
  assert.equal(result['loose-file'], null);
  assert.equal(requests, 0);
});

test('reuses cached artwork after a reload, then refreshes an expired entry', async () => {
  const storage = memoryStorage();
  let requests = 0;
  const fetcher = async () => { requests++; return Response.json({ results: [movie] }); };
  await loadFolderArtwork(nested, { token: 'fake-token', storage, fetcher, now: () => 1000 });
  const cached = await loadFolderArtwork(nested, { token: 'fake-token', storage, fetcher, now: () => 2000 });
  assert.equal(requests, 1);
  assert.equal(cached['file-a']?.id, 1515692);
  assert.equal(storage.getItem(ARTWORK_CACHE_KEY).includes('fake-token'), false);
  await loadFolderArtwork(nested, { token: 'fake-token', storage, fetcher, now: () => 1000 + 8 * 86400000 });
  assert.equal(requests, 2);
});

test('no match and service errors retain the default artwork', async () => {
  for (const fetcher of [
    async () => Response.json({ results: [] }),
    async () => Response.json({ status_message: 'Do not display raw API errors' }, { status: 401 }),
    async () => { throw new Error('Network unavailable'); },
  ]) {
    const result = await loadFolderArtwork(nested, { token: 'fake-token', fetcher });
    assert.equal(result['file-a'], null);
  }
});

test('retains a matched official title even when TMDB has no images', async () => {
  const result = await loadFolderArtwork(nested, { token: 'fake-token', fetcher: async () =>
    Response.json({ results: [{ ...movie, poster_path: null, backdrop_path: null }] }) });
  assert.equal(result['file-a']?.title, 'Baththa');
  assert.equal(result['file-a']?.posterUrl, null);
  assert.equal(result['file-a']?.backdropUrl, null);
});

test('reads cached artwork in browsers without Object.hasOwn', async () => {
  const storage = memoryStorage();
  await loadFolderArtwork(nested, { token: 'fake-token', storage,
    fetcher: async () => Response.json({ results: [movie] }) });
  const original = Object.hasOwn;
  try {
    Object.hasOwn = undefined;
    const result = await loadFolderArtwork(nested, { token: 'fake-token', storage,
      fetcher: async () => { throw new Error('The valid cache should be reused'); } });
    assert.equal(result['file-a']?.title, 'Baththa');
  } finally { Object.hasOwn = original; }
});

test('prefers an exact title match without borrowing artwork from a different result', async () => {
  const result = await loadFolderArtwork(nested, { token: 'fake-token', fetcher: async () => Response.json({ results: [
    { id: 1, title: 'Another Baththa', poster_path: '/wrong.jpg' }, movie,
  ] }) });
  assert.equal(result['file-a']?.id, 1515692);
});

test('aborting an artwork scan prevents additional lookups and stale callbacks', async () => {
  const controller = new AbortController();
  const published = [];
  let requests = 0;
  await assert.rejects(loadFolderArtwork([...nested, { id: 'file-b', folderName: 'Other movie' }], {
    token: 'fake-token', signal: controller.signal,
    fetcher: async () => { requests++; controller.abort(); return Response.json({ results: [movie] }); },
    onArtwork: (...args) => published.push(args),
  }), { name: 'AbortError' });
  assert.equal(requests, 1);
  assert.deepEqual(published, []);
});

test('artwork check separates a working metadata lookup from image loading failure', async () => {
  const result = await tmdb.checkArtworkConnection({ token: 'fake-token',
    fetcher: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://api.themoviedb.org');
      assert.equal(options.headers.Authorization, 'Bearer fake-token');
      return Response.json({ results: [movie] });
    },
    loadImage: async url => { assert.equal(url, 'https://image.tmdb.org/t/p/w500/poster.jpg'); return 'failed'; },
  });
  assert.deepEqual(result, { lookup: 'working', image: 'failed', status: 200 });
});

test('artwork check reports denied or unreachable metadata without exposing credentials', async () => {
  for (const [fetcher, expected] of [
    [async () => Response.json({ status_message: 'private fake-token response' }, { status: 401 }), { lookup: 'failed', image: 'not-tested', status: 401 }],
    [async () => { throw new Error('Network error containing fake-token'); }, { lookup: 'failed', image: 'not-tested' }],
  ]) {
    const result = await tmdb.checkArtworkConnection({ token: 'fake-token', fetcher,
      loadImage: async () => { throw new Error('An image should not be requested'); } });
    assert.deepEqual(result, expected);
    assert.equal(JSON.stringify(result).includes('fake-token'), false);
  }
});

test('artwork check stops a stalled lookup with a timeout', async () => {
  const result = await tmdb.checkArtworkConnection({ token: 'fake-token', timeoutMs: 5,
    fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true })),
  });
  assert.deepEqual(result, { lookup: 'timeout', image: 'not-tested' });
});
