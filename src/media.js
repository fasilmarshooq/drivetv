export function movieInfo(file, metadata) {
  const name = file.name.replace(/\.[^.]+$/, '');
  const year = name.match(/\b(19\d{2}|20\d{2})\b/);
  const title = (year ? name.slice(0, year.index) : name).replace(/[._]/g, ' ').replace(/[\s([\-]+$/, '').trim() || name;
  return {
    title: typeof metadata?.title === 'string' && metadata.title.trim() ? metadata.title.trim() : title,
    year: year?.[0],
    format: file.name.split('.').pop().toUpperCase(),
    resolution: file.name.match(/\b(2160|1080|720|480)p\b/i)?.[0] || (file.videoMediaMetadata?.height ? `${file.videoMediaMetadata.height}p` : ''),
    size: file.size ? `${(Number(file.size) / 1e9).toFixed(2)} GB` : '',
  };
}
export function clockTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const tail = `${minutes}:${String(value % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : tail;
}
