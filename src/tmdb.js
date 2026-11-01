import { readSaved, writeSaved } from './storage.js';

export const ARTWORK_CACHE_KEY = 'drive-tv.tmdb-artwork.v1';
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
  if (!posterUrl && !backdropUrl) return null;
  return { id: match.id, title: match.title, posterUrl, backdropUrl };
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
    if (cache[key]?.expires > now() && Object.hasOwn(cache[key], 'artwork')) {
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
