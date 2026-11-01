export function readSaved(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeSaved(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function progressEntry(time, duration, updated = Date.now()) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || time < 5 || duration <= 0 || time >= duration - 15) return null;
  return { time, duration, updated };
}
export function deviceStorage() {
  try { return window.localStorage; } catch { return null; }
}
