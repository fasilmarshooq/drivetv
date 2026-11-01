import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Search, Settings, RefreshCw, Info, FolderOpen, ArrowRight, Clapperboard, MonitorPlay, X, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { listVideos, parseFolder } from './drive.js';
import { moveFocus } from './navigation.js';
import { readSaved, writeSaved, progressEntry, deviceStorage } from './storage.js';
import { movieInfo, clockTime } from './media.js';
import Modal from './Modal.jsx';
import Player from './Player.jsx';
import Artwork from './Artwork.jsx';
import { ARTWORK_CACHE_KEY, loadFolderArtwork } from './tmdb.js';
import { TMDB_TOKEN, DEFAULT_FOLDER, DRIVE_API_KEY, SETTINGS_KEY, initialConfig } from './config.js';
const PROGRESS_KEY = 'drive-tv.progress';

function Badges({ file }) {
  const info = movieInfo(file);
  return <div className="badges">{info.year && <span>{info.year}</span>}{info.resolution && <span className="outline-badge">{info.resolution}</span>}<span className="outline-badge">{info.format}</span>{info.size && <span>{info.size}</span>}</div>;
}

function SettingsPanel({ config, onSave, onForget, onClose }) {
  const [folder, setFolder] = useState(config?.folder || DEFAULT_FOLDER);
  const [key, setKey] = useState(config?.key || DRIVE_API_KEY);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    try {
      parseFolder(folder);
      if (!key.trim()) throw new Error('Enter your Google Drive API key.');
      onSave({ folder: folder.trim(), key: key.trim() });
    } catch (problem) { setError(problem.message); }
  }
  return <Modal label="Library settings" onClose={onClose} className="settings-modal">
    <div className="modal-symbol"><FolderOpen size={30} /></div>
    <h2>{config ? 'Your library settings' : 'Connect your library'}</h2>
    <p className="muted">Add a public Drive folder. Your videos play directly from Google.</p>
    <form onSubmit={submit}>
      <label htmlFor="folder">Google Drive folder link</label>
      <input id="folder" value={folder} onChange={event => setFolder(event.target.value)} placeholder="https://drive.google.com/drive/folders/…" required />
      <p className="field-help">Set the folder’s sharing to “Anyone with the link”. Videos in this folder and its subfolders appear in your library.</p>
      <label htmlFor="api-key">Google Drive API key</label>
      <div className="key-input"><input id="api-key" data-first-focus value={key} onChange={event => setKey(event.target.value)} type={show ? 'text' : 'password'} autoComplete="off" spellCheck="false" placeholder="Paste your API key" required />
        <button type="button" className="icon-button" aria-label={show ? 'Hide API key' : 'Show API key'} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</button></div>
      <p className="field-help">Saved in this browser. No Google sign-in needed. Only public files are accessible with this key.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="button primary wide">{config ? 'Save and reload' : 'Open library'}<ArrowRight /></button>
    </form>
    {config && <button className="text-button forget" onClick={onForget}>Forget this device</button>}
  </Modal>;
}

function MovieCard({ file, saved, onPlay, artwork }) {
  const info = movieInfo(file);
  return <button className="movie-card" onClick={() => onPlay(file)} aria-label={`Open ${info.title}`}>
    <div className="card-art"><Artwork title={info.title} artwork={artwork} /><span className="card-format">{info.resolution || info.format}</span><span className="card-play"><Play size={25} fill="currentColor" /></span>
      {saved && <span className="progress-track"><span style={{ width: `${Math.min(100, saved.time / saved.duration * 100)}%` }} /></span>}
    </div>
    <div className="card-caption"><strong>{info.title}</strong><span>{saved ? `${clockTime(saved.time)} watched` : [info.year, info.format].filter(Boolean).join(' · ')}</span></div>
  </button>;
}

export default function App() {
  const [config, setConfig] = useState(initialConfig);
  const [files, setFiles] = useState([]);
  const [artworkById, setArtworkById] = useState({});
  const [loading, setLoading] = useState(Boolean(config));
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [details, setDetails] = useState(null);
  const [active, setActive] = useState(null);
  const [search, setSearch] = useState('');
  const [progress, setProgress] = useState(() => {
    const value = readSaved(deviceStorage(), PROGRESS_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  });
  const [storageNotice, setStorageNotice] = useState('');
  const lastTrigger = useRef(null);

  useEffect(() => {
    if (!config) { setFiles([]); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    listVideos(config, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setFiles(result); setLoading(false); }
    }).catch(error => {
      if (!controller.signal.aborted) { setLoadError(error.message); setLoading(false); }
    });
    return () => controller.abort();
  }, [config, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setArtworkById({});
    loadFolderArtwork(files, {
      token: TMDB_TOKEN, storage: deviceStorage(), signal: controller.signal,
      onArtwork(ids, artwork) {
        if (!controller.signal.aborted) {
          setArtworkById(current => ({ ...current, ...Object.fromEntries(ids.map(id => [id, artwork])) }));
        }
      },
    }).catch(() => { /* Artwork is optional; the library remains usable. */ });
    return () => controller.abort();
  }, [files]);

  useEffect(() => {
    if (active) return;
    const onKey = event => {
      if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || [461, 10009].includes(event.keyCode)) {
        if (dialog) { event.preventDefault(); setDialog(null); }
        else if (search) { event.preventDefault(); setSearch(''); }
        return;
      }
      moveFocus(event, dialog ? document.querySelector('[role="dialog"]') : document);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, dialog, search]);

  const saveProgress = useCallback((id, time, duration) => {
    if (!Number.isFinite(time) || !Number.isFinite(duration)) return;
    setProgress(current => {
      const next = { ...current };
      const entry = progressEntry(time, duration);
      if (entry) next[id] = entry;
      else delete next[id];
      writeSaved(deviceStorage(), PROGRESS_KEY, next);
      return next;
    });
  }, []);

  function openPlayer(file, startOver = false) {
    lastTrigger.current = document.activeElement;
    setDialog(null);
    setActive({ file, resume: startOver ? 0 : progress[file.id]?.time || 0 });
  }
  const closePlayer = useCallback(() => {
    setActive(null);
    requestAnimationFrame(() => {
      if (lastTrigger.current?.isConnected) lastTrigger.current.focus();
      else document.querySelector('[data-hero-play]')?.focus();
    });
  }, []);

  function saveSettings(value) {
    const saved = writeSaved(deviceStorage(), SETTINGS_KEY, value);
    setStorageNotice(saved ? '' : 'Your browser cannot save settings. The library will work until you close this page.');
    setConfig(value); setDialog(null); setSearch('');
  }
  function forget() {
    try { const storage = deviceStorage(); storage?.removeItem(SETTINGS_KEY); storage?.removeItem(PROGRESS_KEY); storage?.removeItem(ARTWORK_CACHE_KEY); } catch { /* Browser storage can be disabled. */ }
    setConfig(null); setProgress({}); setDialog(null); setFiles([]); setSearch(''); setLoadError(''); setStorageNotice('');
  }
  const featured = files[0];
  const featuredInfo = featured && movieInfo(featured);
  const visible = files.filter(file => movieInfo(file).title.toLowerCase().includes(search.toLowerCase()));
  const continuing = files.filter(file => progress[file.id]).sort((a, b) => progress[b.id].updated - progress[a.id].updated);
  const openDetails = file => { setDetails(file); setDialog('details'); };

  return <>
    <div className="app-shell" inert={dialog || active ? true : undefined}>
      <header className="site-header">
        <button className="wordmark" aria-label="Drive TV home" onClick={() => { setSearch(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span className="brand-mark"><Play size={18} fill="currentColor" /></span>DRIVE<span>TV</span></button>
        <nav aria-label="Main navigation"><button className="nav-link active" onClick={() => { setSearch(''); document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' }); }}>My library</button></nav>
        <div className="header-tools">{config && <div className="search-field"><Search size={18} /><input aria-label="Search your library" placeholder="Search your library" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear search" className="icon-button" onClick={() => setSearch('')}><X size={16} /></button>}</div>}
          <button className="icon-button settings-button" aria-label="Settings" onClick={() => setDialog('settings')}><Settings size={21} /></button><span className="profile" aria-hidden="true">M</span></div>
      </header>

      <main>
        {!config ? <section className="hero welcome-hero"><Artwork title="Movie night" className="hero-art welcome-art" /><div className="hero-shade" /><div className="hero-content">
          <span className="source-label"><MonitorPlay size={17} /> Your own cinema</span>
          <h1>Your movies.<br />Your screen.</h1>
          <p className="hero-description">A quiet place for your movie nights. Connect your Google Drive, pick something good, and press play.</p>
          <div className="actions"><button className="button primary" onClick={() => setDialog('settings')}><FolderOpen size={21} />Connect Google Drive</button></div>
          <p className="hero-footnote">No sign-in. Just your shared folder.</p>
        </div></section> : loading ? <section className="loading-state" role="status"><div className="loading-reel"><Clapperboard size={38} /></div><h1>Opening your library</h1><p>Finding the videos in your Drive folder…</p></section> : loadError ? <section className="empty-state error-state" role="alert"><AlertCircle size={40} /><h1>Let’s reconnect your library</h1><p>{loadError}</p><div className="actions"><button className="button primary" onClick={() => setDialog('settings')}><Settings /> Check settings</button><button className="button secondary" onClick={() => setRefresh(value => value + 1)}><RefreshCw /> Try again</button></div></section> : featured ? <section className="hero movie-hero">
          <Artwork title={featuredInfo.title} className="hero-art" artwork={artworkById[featured.id]} eager /><div className="hero-shade" />
          <div className="hero-content"><span className="source-label"><span className="live-dot" /> In your Drive library</span>
            <h1 className="movie-title">{featuredInfo.title}</h1><Badges file={featured} />
            <p className="hero-description">Ready when you are. Your movie, streamed straight from your own collection.</p>
            <div className="actions"><button data-hero-play className="button primary" aria-label={`Play ${featuredInfo.title}`} onClick={() => openPlayer(featured)}><Play size={23} fill="currentColor" />{progress[featured.id] ? `Resume ${clockTime(progress[featured.id].time)}` : 'Play movie'}</button>
              <button className="button secondary" onClick={() => openDetails(featured)}><Info size={22} />Details</button></div>
            {progress[featured.id] && <button className="text-button restart" onClick={() => openPlayer(featured, true)}>Play from the beginning</button>}
          </div>
        </section> : <section className="empty-state"><FolderOpen size={40} /><h1>Your library is ready for movies</h1><p>Add videos to this Drive folder or any of its subfolders, then refresh.</p><button className="button primary" onClick={() => setRefresh(value => value + 1)}><RefreshCw /> Refresh library</button></section>}

        {storageNotice && <p className="storage-notice" role="status">{storageNotice}</p>}
        {config && !loading && !loadError && files.length > 0 && <div className="library-content" id="library">
          {!search && continuing.length > 0 && <section className="library-section"><div className="section-heading"><h2>Continue watching</h2><span>Pick up where you left off</span></div><div className="movie-row">{continuing.map(file => <MovieCard key={file.id} file={file} saved={progress[file.id]} onPlay={openPlayer} artwork={artworkById[file.id]} />)}</div></section>}
          <section className="library-section"><div className="section-heading"><h2>{search ? 'Search results' : 'Your collection'}</h2><div className="collection-tools"><span>{visible.length} {visible.length === 1 ? 'video' : 'videos'}</span><button className="icon-button" aria-label="Refresh library" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button></div></div>
            {visible.length ? <div className="movie-row">{visible.map(file => <MovieCard key={file.id} file={file} saved={progress[file.id]} onPlay={openPlayer} artwork={artworkById[file.id]} />)}</div> : <div className="search-empty"><Search /><h3>No matching videos</h3><p>Try another title.</p><button className="text-button" onClick={() => setSearch('')}>Clear search</button></div>}
          </section>
        </div>}
        {!config && <section className="welcome-bottom"><div><Clapperboard size={25} /><h2>A library that’s yours.</h2><p>Only the videos in your folder. Nothing else to scroll through.</p></div><div><MonitorPlay size={25} /><h2>Made for the big screen.</h2><p>Use your TV remote’s arrows and OK, or watch on your phone.</p></div><div><Check size={25} /><h2>Pick up where you paused.</h2><p>Your place is remembered on this device.</p></div></section>}
      </main>
      <footer className="site-footer"><span>DRIVE TV<span className="footer-dot">•</span>Your personal picture house<button className="text-button credits-link" onClick={() => setDialog('credits')}>Credits</button></span><span><span className="status-dot" />{config && !loadError ? 'Google Drive connected' : 'Bring your own library'}</span></footer>
    </div>

    {dialog === 'settings' && <SettingsPanel config={config} onSave={saveSettings} onForget={forget} onClose={() => setDialog(null)} />}
    {dialog === 'details' && details && <Modal label="Movie details" onClose={() => setDialog(null)} className="details-modal"><Artwork title={movieInfo(details).title} className="details-art" artwork={artworkById[details.id]} eager /><div className="details-body"><h2>{movieInfo(details).title}</h2><Badges file={details} /><p className="muted file-name">{details.name}</p><p className="muted">Playback uses the original file. Video and audio support depend on your TV or browser.</p><button className="button primary" onClick={() => openPlayer(details)}><Play fill="currentColor" />{progress[details.id] ? 'Resume movie' : 'Play movie'}</button></div></Modal>}
    {dialog === 'credits' && <Modal label="Credits" onClose={() => setDialog(null)}><h2>Credits</h2><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img className="tmdb-logo" src={`${import.meta.env.BASE_URL}brand/tmdb.svg`} alt="TMDB" /></a><p className="muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p className="muted">Movie artwork is matched using your subfolder names. Unmatched movies keep the default title artwork.</p></Modal>}
    {active && <Player file={active.file} apiKey={config.key} resume={active.resume} onProgress={saveProgress} onClose={closePlayer} />}
  </>;
}
