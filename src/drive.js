const API = 'https://www.googleapis.com/drive/v3/files';
const validId = /^[a-zA-Z0-9_-]{10,}$/;

export function parseFolder(input) {
  const value = String(input || '').trim();
  if (validId.test(value)) return { id: value, resourceKey: '' };
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && match && validId.test(match[1])) {
      const resourceKey = url.searchParams.get('resourcekey') || '';
      if (resourceKey && !/^[a-zA-Z0-9_-]+$/.test(resourceKey)) throw new Error();
      return { id: match[1], resourceKey };
    }
  } catch { /* One useful validation message for all invalid links. */ }
  throw new Error('Paste a Google Drive folder link, rather than an individual file link.');
}

export async function listVideos({ folder, key }, { signal, fetcher = fetch } = {}) {
  const root = parseFolder(folder);
  if (!key?.trim()) throw new Error('Enter your Google Drive API key.');
  const files = [];
  const fileIds = new Set();
  const folders = [root];
  const folderIds = new Set([root.id]);
  // Scan sequentially: one request at a time, and each folder only once.
  for (let index = 0; index < folders.length; index++) {
    const entries = await listFolder(folders[index], key.trim(), signal, fetcher);
    for (const entry of entries) {
      if (entry.mimeType === 'application/vnd.google-apps.folder') {
        if (!validId.test(entry.id)) throw new Error('Google returned an invalid subfolder. Refresh the library.');
        if (!folderIds.has(entry.id)) {
          folderIds.add(entry.id);
          folders.push({ id: entry.id, name: entry.name, resourceKey: entry.resourceKey || '' });
        }
      } else if (!entry.mimeType?.startsWith('application/vnd.google-apps.')
        && (entry.mimeType?.startsWith('video/') || /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|mpg|mpeg)$/i.test(entry.name))
        && !fileIds.has(entry.id)) {
        fileIds.add(entry.id);
        files.push({ ...entry, folderName: folders[index].name || null });
      }
    }
  }
  return files;
}

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Folder scan cancelled.', 'AbortError');
}

async function listFolder({ id, resourceKey }, key, signal, fetcher) {
  const entries = [];
  let pageToken = '';
  do {
    checkCancelled(signal);
    const query = new URLSearchParams({
      q: `'${id}' in parents and trashed = false`,
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,size,resourceKey,videoMediaMetadata(durationMillis,width,height))',
      orderBy: 'name',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const headers = { 'x-goog-api-key': key };
    if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${id}/${resourceKey}`;
    let response;
    try { response = await fetcher(`${API}?${query}`, { headers, signal }); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Could not reach Google Drive. Check your connection and try again.');
    }
    if (!response.ok) {
      if (response.status === 400) throw new Error('Check your API key and make sure the Google Drive API is enabled.');
      if (response.status === 404) throw new Error('Folder not found. Check the link and set sharing to “Anyone with the link”.');
      if (response.status === 429) throw new Error('Google Drive is limiting requests. Try again in a few minutes.');
      if (response.status === 403) throw new Error('Google denied access. Make the folder public and check your API key restrictions and quota.');
      throw new Error('Google Drive could not load this folder. Try again.');
    }
    const data = await response.json();
    checkCancelled(signal);
    entries.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return entries;
}

export function mediaUrl(file, key) {
  const query = new URLSearchParams({ alt: 'media', key: key.trim() });
  if (file.resourceKey) query.set('resourceKey', file.resourceKey);
  return `${API}/${encodeURIComponent(file.id)}?${query}`;
}
