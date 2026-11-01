import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFolder, listVideos, mediaUrl } from '../src/drive.js';

test('accepts a Drive folder link including its resource key', () => {
  assert.deepEqual(parseFolder('https://drive.google.com/drive/u/0/folders/folder_123456?resourcekey=abc-123'), { id: 'folder_123456', resourceKey: 'abc-123' });
  assert.deepEqual(parseFolder('folder_123456'), { id: 'folder_123456', resourceKey: '' });
});

test('rejects file links, foreign hosts and query injection', () => {
  for (const input of ['https://example.org/folders/folder_123456', "abc' or true", 'https://drive.google.com/file/d/file_123456/view', '']) {
    assert.throws(() => parseFolder(input), /folder/i);
  }
});

test('loads every page, scopes requests to the folder, and filters non-video files', async () => {
  let calls = 0;
  const files = await listVideos({ folder: 'folder_123456', key: 'test-key' }, { fetcher: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://www.googleapis.com');
    assert.equal(parsed.searchParams.get('q'), "'folder_123456' in parents and trashed = false");
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    assert.equal(parsed.searchParams.has('key'), false);
    calls++;
    if (calls === 1) return Response.json({ files: [{ id: 'video-a', name: 'Film.mp4', mimeType: 'video/mp4' }, { id: 'doc', name: 'notes.txt', mimeType: 'text/plain' }], nextPageToken: 'second' });
    assert.equal(parsed.searchParams.get('pageToken'), 'second');
    return Response.json({ files: [{ id: 'video-b', name: 'Film.mkv', mimeType: 'application/octet-stream' }] });
  }});
  assert.deepEqual(files.map(file => file.id), ['video-a', 'video-b']);
  assert.equal(calls, 2);
});

test('sends a resource key when listing link-protected public folders', async () => {
  const files = await listVideos({ folder: 'https://drive.google.com/drive/folders/folder_123456?resourcekey=folder-access', key: 'test-key' }, { fetcher: async (url, options) => {
    assert.equal(options.headers['X-Goog-Drive-Resource-Keys'], 'folder_123456/folder-access');
    return Response.json({ files: [{ id: 'protected-video', name: 'Protected.mp4', mimeType: 'video/mp4' }] });
  }});
  assert.equal(files[0]?.id, 'protected-video');
});

test('shows an actionable permission error without echoing API error details or keys', async () => {
  await assert.rejects(listVideos({ folder: 'folder_123456', key: 'test-secret' }, { fetcher: async () => Response.json({ error: { message: 'test-secret', errors: [{ reason: 'forbidden' }] } }, { status: 403 }) }), error => /public|permission|access/i.test(error.message) && !error.message.includes('test-secret'));
});

test('builds an original media URL with encoded runtime credentials and resource key', () => {
  const url = new URL(mediaUrl({ id: 'video_123456', resourceKey: 'r-key' }, 'key+value'));
  assert.equal(url.pathname, '/drive/v3/files/video_123456');
  assert.equal(url.searchParams.get('alt'), 'media');
  assert.equal(url.searchParams.get('key'), 'key+value');
  assert.equal(url.searchParams.get('resourceKey'), 'r-key');
});

test('finds movies moved into nested folders, including later pages of a child folder', async () => {
  const pages = {
    folder_123456: { files: [{ id: 'child_123456', name: 'Movies', mimeType: 'application/vnd.google-apps.folder' }] },
    child_123456: { files: [{ id: 'grand_123456', name: 'Tamil', mimeType: 'application/vnd.google-apps.folder' }], nextPageToken: 'more' },
    'child_123456:more': { files: [{ id: 'second-movie', name: 'Another.mp4', mimeType: 'video/mp4' }] },
    grand_123456: { files: [{ id: 'moved-movie', name: 'Baththa.mkv', mimeType: 'video/x-matroska' }] },
  };
  const files = await listVideos({ folder: 'folder_123456', key: 'test-key' }, { fetcher: async url => {
    const params = new URL(url).searchParams;
    const id = params.get('q').match(/^'([^']+)' in parents/)[1];
    const page = `${id}${params.has('pageToken') ? `:${params.get('pageToken')}` : ''}`;
    assert.ok(pages[page], `Unexpected folder request ${page}`);
    return Response.json(pages[page]);
  }});
  assert.deepEqual(files.map(file => file.id), ['second-movie', 'moved-movie']);
  assert.equal(files.find(file => file.id === 'moved-movie').folderName, 'Tamil');
  assert.equal(files.find(file => file.id === 'second-movie').folderName, 'Movies');
});

test('uses each child resource key and visits duplicate folders and files only once', async () => {
  const calls = [];
  const movie = { id: 'unique-movie', name: 'Movie.mp4', mimeType: 'video/mp4' };
  const files = await listVideos({ folder: 'folder_123456', key: 'test-key' }, { fetcher: async (url, options) => {
    const id = new URL(url).searchParams.get('q').match(/^'([^']+)' in parents/)[1];
    calls.push(id);
    if (calls.length > 2) throw new Error('Folder was scanned more than once');
    if (id === 'folder_123456') return Response.json({ files: [movie,
      { id: 'shortcut_123456', name: 'Shortcut.mp4', mimeType: 'application/vnd.google-apps.shortcut' },
      { id: 'child_123456', name: 'A folder.mkv', mimeType: 'application/vnd.google-apps.folder', resourceKey: 'child-key' },
      { id: 'child_123456', name: 'A folder.mkv', mimeType: 'application/vnd.google-apps.folder', resourceKey: 'child-key' },
    ] });
    assert.equal(options.headers['X-Goog-Drive-Resource-Keys'], 'child_123456/child-key');
    return Response.json({ files: [movie, { id: 'folder_123456', name: 'Root again', mimeType: 'application/vnd.google-apps.folder' }] });
  }});
  assert.deepEqual(files.map(file => file.id), ['unique-movie']);
  assert.deepEqual(calls, ['folder_123456', 'child_123456']);
});

test('cancelling a scan stops it before requesting the next subfolder', async () => {
  const controller = new AbortController();
  let requests = 0;
  await assert.rejects(listVideos({ folder: 'folder_123456', key: 'test-key' }, {
    signal: controller.signal,
    fetcher: async () => {
      requests++;
      controller.abort();
      return Response.json({ files: [{ id: 'child_123456', name: 'Movies', mimeType: 'application/vnd.google-apps.folder' }] });
    },
  }), { name: 'AbortError' });
  assert.equal(requests, 1);
});

test('a denied child folder produces an actionable error instead of a misleading empty library', async () => {
  await assert.rejects(listVideos({ folder: 'folder_123456', key: 'test-key' }, { fetcher: async url => {
    const id = new URL(url).searchParams.get('q').match(/^'([^']+)' in parents/)[1];
    if (id === 'folder_123456') return Response.json({ files: [{ id: 'child_123456', name: 'Movies', mimeType: 'application/vnd.google-apps.folder' }] });
    return Response.json({ error: { message: 'test-key' } }, { status: 403 });
  }}), error => /sharing|public|access/i.test(error.message) && !error.message.includes('test-key'));
});
