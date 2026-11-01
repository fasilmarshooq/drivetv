import { readSaved, writeSaved } from './storage.js';

export const ARTWORK_CACHE_KEY = 'drive-tv.tmdb-artwork.v2';
const DAY = 86400000;
const normalize = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Artwork scan cancelled.', 'AbortError');
}

function imageUrl(path, size) {
  return typeof path === 'string' && /^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/i.test(path)
    ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function artworkFor(results, query) {
  if (!Array.isArray(results)) return null;
  const match = results.find(movie => normalize(movie.title) === normalize(query) || normalize(movie.original_title) === normalize(query)) || results[0];
  if (!match || !Number.isInteger(match.id) || match.id <= 0) return null;
  const posterUrl = imageUrl(match.poster_path, 'w500');
  const backdropUrl = imageUrl(match.backdrop_path, 'w1280');
  const title = typeof match.title === 'string' && match.title.trim() ? match.title.trim()
    : typeof match.original_title === 'string' ? match.original_title.trim() : '';
  return { id: match.id, title, posterUrl, backdropUrl };
}

export async function loadFolderArtwork(files, { token, storage, fetcher = fetch, signal, onArtwork = () => {}, now = Date.now } = {}) {
  const result = Object.fromEntries(files.map(file => [file.id, null]));
  const groups = new Map();
  for (const file of files) {
    const query = typeof file.folderName === 'string' ? file.folderName.trim() : '';
    if (!query) continue;
    const key = `folder:${normalize(query)}`;
    if (!groups.has(key)) groups.set(key, { query, ids: [] });
    groups.get(key).ids.push(file.id);
  }
  if (!token?.trim()) return result;
  const saved = readSaved(storage, ARTWORK_CACHE_KEY, {});
  const cache = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  for (const [key, group] of groups) {
    checkCancelled(signal);
    let artwork = null;
    if (cache[key]?.expires > now() && Object.prototype.hasOwnProperty.call(cache[key], 'artwork')) {
      artwork = cache[key].artwork;
    } else {
      try {
        const params = new URLSearchParams({ query: group.query, include_adult: 'false', language: 'en-US', page: '1' });
        const response = await fetcher(`https://api.themoviedb.org/3/search/movie?${params}`, {
          headers: { Authorization: `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}` }, signal,
        });
        if (response.ok) {
          const data = await response.json();
          checkCancelled(signal);
          artwork = artworkFor(data.results, group.query);
          cache[key] = { artwork, expires: now() + (artwork ? 7 * DAY : DAY) };
          writeSaved(storage, ARTWORK_CACHE_KEY, cache);
        }
      } catch (error) {
        if (error.name === 'AbortError' || signal?.aborted) { checkCancelled(signal); throw error; }
        // Artwork is optional: network/auth failures must not hide the library.
      }
    }
    checkCancelled(signal);
    for (const id of group.ids) result[id] = artwork;
    onArtwork(group.ids, artwork);
  }
  return result;
}

function diagnosticImage(url, signal) {
  return new Promise(resolve => {
    const image = new Image();
    const finish = state => {
      image.onload = null; image.onerror = null;
      signal.removeEventListener('abort', cancel);
      resolve(state);
    };
    const cancel = () => finish('timeout');
    image.onload = () => finish(image.naturalWidth > 0 ? 'working' : 'failed');
    image.onerror = () => finish('failed');
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else image.src = url;
  });
}

// Only safe stage/status values leave this check. Never return URLs, keys or raw errors.
export async function checkArtworkConnection({ token, fetcher = fetch, loadImage = diagnosticImage, signal, timeoutMs = 10000 } = {}) {
  if (!token?.trim()) return { lookup: 'not-configured', image: 'not-tested' };
  checkCancelled(signal);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    let response;
    let artwork;
    try {
      const params = new URLSearchParams({ query: 'Big Buck Bunny', include_adult: 'false', language: 'en-US' });
      response = await fetcher(`https://api.themoviedb.org/3/search/movie?${params}`, {
        headers: { Authorization: `Bearer ${token.trim().replace(/^Bearer\s+/i, '')}` }, signal: controller.signal,
      });
      if (!response.ok) return { lookup: 'failed', image: 'not-tested', status: response.status };
      artwork = artworkFor((await response.json()).results, 'Big Buck Bunny');
    } catch {
      checkCancelled(signal);
      return { lookup: controller.signal.aborted ? 'timeout' : 'failed', image: 'not-tested' };
    }
    checkCancelled(signal);
    const imageUrl = artwork?.posterUrl || artwork?.backdropUrl;
    if (!imageUrl) return { lookup: 'working', image: 'no-image', status: response.status };
    let image;
    try { image = await loadImage(imageUrl, controller.signal); }
    catch { image = controller.signal.aborted ? 'timeout' : 'failed'; }
    checkCancelled(signal);
    return { lookup: 'working', image, status: response.status };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
