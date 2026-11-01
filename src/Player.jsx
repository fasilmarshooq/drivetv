import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { ArrowLeft, RotateCcw, RotateCw, Play, Pause, Maximize, ExternalLink, AlertCircle } from 'lucide-react';
import { mediaUrl } from './drive.js';
import { movieInfo, clockTime } from './media.js';
import { moveFocus } from './navigation.js';

// Drive's download path has no file extension. Video.js otherwise rejects it
// before requesting any bytes. Hand this source to the native media element,
// which can inspect the response and decide whether it can decode the file.
videojs.getTech('Html5').registerSourceHandler({
  canHandleSource: source => source.type === 'video/x-drive-original' ? 'maybe' : '',
  handleSource(source, tech) {
    tech.setSrc(source.src);
    return { dispose() {} };
  },
}, 0);

export default function Player({ file, apiKey, resume, onProgress, onClose }) {
  const host = useRef(null);
  const root = useRef(null);
  const player = useRef(null);
  const progressCallback = useRef(onProgress);
  progressCallback.current = onProgress;
  const [paused, setPaused] = useState(true);
  const [error, setError] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState('');
  const info = movieInfo(file);

  useEffect(() => {
    const video = document.createElement('video-js');
    video.classList.add('vjs-big-play-centered');
    host.current.appendChild(video);
    const instance = videojs(video, {
      controls: true, autoplay: false, preload: 'metadata', playsinline: true,
      fill: true, responsive: true, inactivityTimeout: 3000,
      controlBar: { pictureInPictureToggle: false },
      sources: [{ src: mediaUrl(file, apiKey), type: 'video/x-drive-original' }],
    });
    player.current = instance;
    let lastSaved = 0;
    const save = () => progressCallback.current(file.id, instance.currentTime(), instance.duration());
    const timer = window.setTimeout(() => setSlow(true), 15000);
    instance.on('loadedmetadata', () => {
      if (resume > 0 && Number.isFinite(instance.duration()) && resume < instance.duration() - 15) instance.currentTime(resume);
      instance.play()?.catch(() => setWaiting(false));
    });
    instance.on('playing', () => { setPaused(false); setWaiting(false); setSlow(false); });
    instance.on('play', () => setPaused(false));
    instance.on('pause', () => { setPaused(true); save(); });
    instance.on('waiting', () => setWaiting(true));
    instance.on('canplay', () => setWaiting(false));
    instance.on('ended', save);
    instance.on('timeupdate', () => {
      if (Date.now() - lastSaved > 3000) { lastSaved = Date.now(); save(); }
    });
    instance.on('error', () => { setError(true); setWaiting(false); });
    const hide = () => save();
    window.addEventListener('pagehide', hide);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current.querySelector('button')?.focus();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', hide);
      document.body.style.overflow = oldOverflow;
      save();
      instance.dispose();
      player.current = null;
    };
  }, [file.id, apiKey]);

  function toggle() {
    const instance = player.current;
    if (!instance) return;
    if (instance.paused()) instance.play()?.catch(() => setNotice('Select Play in the video controls to begin.'));
    else instance.pause();
  }
  function seek(offset) {
    const instance = player.current;
    if (!instance) return;
    const duration = instance.duration();
    instance.currentTime(Math.max(0, Math.min((instance.currentTime() || 0) + offset, Number.isFinite(duration) ? duration : Infinity)));
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current.requestFullscreen) await root.current.requestFullscreen();
      else player.current?.requestFullscreen();
    } catch { setNotice('Fullscreen is unavailable in this browser.'); }
  }
  useEffect(() => {
    if (error) root.current.querySelector('.playback-error button')?.focus();
  }, [error]);
  useEffect(() => {
    const onKey = event => {
      if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || [461, 10009].includes(event.keyCode)) {
        event.preventDefault(); onClose(); return;
      }
      if (event.key === 'MediaPlayPause' || (event.key === ' ' && !event.target.closest('button, input, [role="slider"]'))) {
        event.preventDefault(); toggle(); return;
      }
      const stage = event.target.matches('video, video-js, .vjs-tech') || event.target === root.current;
      if (stage && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); seek(event.key === 'ArrowLeft' ? -10 : 10); return; }
      if (stage && event.key === 'Enter') { event.preventDefault(); toggle(); return; }
      moveFocus(event, root.current);
    };
    // Playback errors can remove the focused control and leave focus on BODY.
    // Keep Back available even when no descendant of the player owns focus.
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="player-screen" ref={root} role="dialog" aria-modal="true" aria-label="Video player" tabIndex={-1}>
    <header className="player-header">
      <button className="button subtle" onClick={onClose}><ArrowLeft /> Back to library</button>
      <div><strong>{info.title}</strong><span>{info.year} {info.resolution} {info.format}</span></div>
    </header>
    <div className="video-stage" data-vjs-player><div ref={host} className="video-host" /></div>
    {error && <div className="playback-error" role="alert">
      <AlertCircle size={36} /><h2>This video could not play here</h2>
      <p>The browser may not support this file’s video or audio format. Google may also be blocking the download.</p>
      <p>For the widest TV support, try an MP4 with H.264 video and AAC audio. This app plays the original file without converting it.</p>
      <div className="actions"><button className="button primary" onClick={onClose}><ArrowLeft /> Back to library</button>
        <a className="button secondary" href={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`} target="_blank" rel="noreferrer"><ExternalLink /> Open in Drive</a></div>
    </div>}
    {!error && <footer className="player-footer">
      <div className="player-actions">
        <button className="button secondary" aria-label="Rewind 10 seconds" onClick={() => seek(-10)}><RotateCcw /><span>10s</span></button>
        <button className="button primary" aria-label={paused ? 'Resume playback' : 'Pause playback'} onClick={toggle}>{paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}<span>{paused ? 'Play' : 'Pause'}</span></button>
        <button className="button secondary" aria-label="Forward 10 seconds" onClick={() => seek(10)}><RotateCw /><span>10s</span></button>
        <button className="button secondary" aria-label="Fullscreen" onClick={fullscreen}><Maximize /><span>Fullscreen</span></button>
      </div>
      <p className="player-hint" role="status">{notice || (slow && waiting ? 'Still loading. If playback does not start, try an H.264 / AAC MP4.' : waiting ? 'Opening your video…' : 'Use the arrows and OK to select a control. Back returns to your library.')}{resume > 0 && waiting ? ` Resuming from ${clockTime(resume)}.` : ''}</p>
    </footer>}
  </div>;
}
