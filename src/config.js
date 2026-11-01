import { readSaved, deviceStorage } from './storage.js';

export const SETTINGS_KEY = 'drive-tv.settings';
export const DEFAULT_FOLDER = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER?.trim()
  || '';
export const DRIVE_API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY?.trim() || '';
export const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN?.trim() || '';

export function initialConfig() {
  const value = readSaved(deviceStorage(), SETTINGS_KEY, null);
  if (value && typeof value.folder === 'string' && value.folder.trim()
    && typeof value.key === 'string' && value.key.trim()) return value;
  return DRIVE_API_KEY && DEFAULT_FOLDER ? { folder: DEFAULT_FOLDER, key: DRIVE_API_KEY } : null;
}
