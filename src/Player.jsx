import React, { useCallback, useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { ArrowLeft, RotateCcw, RotateCw, Play, Pause, Maximize, ExternalLink, AlertCircle } from 'lucide-react';
import { mediaUrl } from './drive.js';
import { movieInfo, clockTime } from './media.js';
import { moveFocus } from './navigation.js';
import { fullscreenElement, enterFullscreen, leaveFullscreen } from './fullscreen.js';

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

export default function Player({ file, metadata, apiKey, resume, onProgress, onClose }) {
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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState('');
  const feedbackTimer = useRef(null);
  const lastPointer = useRef(0);
  const info = movieInfo(file, metadata);
  const showControls = controlsVisible || paused || waiting || error;
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    setActivity(value => value + 1);
  }, []);

  useEffect(() => {
    if (paused || waiting || error) return;
    const timer = window.setTimeout(() => {
      root.current?.focus({ preventScroll: true });
      setControlsVisible(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [paused, waiting, error, activity]);

  useEffect(() => {
    const changed = () => {
      setIsFullscreen(fullscreenElement() === root.current);
      root.current?.focus({ preventScroll: true });
      revealControls();
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('webkitfullscreenchange', changed);
    changed();
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('webkitfullscreenchange', changed);
      clearTimeout(feedbackTimer.current);
    };
  }, [revealControls]);

  useEffect(() => {
    const video = document.createElement('video-js');
    video.classList.add('vjs-big-play-centered');
    host.current.appendChild(video);
    const instance = videojs(video, {
      controls: false, autoplay: false, preload: 'metadata', playsinline: true,
      fill: true, responsive: true, inactivityTimeout: 3000,
      sources: [{ src: mediaUrl(file, apiKey), type: 'video/x-drive-original' }],
    });
    player.current = instance;
    let lastSaved = 0;
    const save = () => progressCallback.current(file.id, instance.currentTime(), instance.duration());
    const timer = window.setTimeout(() => setSlow(true), 15000);
    instance.on('loadedmetadata', () => {
      setDuration(Number.isFinite(instance.duration()) ? instance.duration() : 0);
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
      setPosition(instance.currentTime() || 0);
      if (Date.now() - lastSaved > 3000) { lastSaved = Date.now(); save(); }
    });
    instance.on('error', () => { setError(true); setWaiting(false); });
    const hide = () => save();
    window.addEventListener('pagehide', hide);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current.focus({ preventScroll: true });
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
    revealControls();
    if (instance.paused()) instance.play()?.catch(() => setNotice('Select Play in the video controls to begin.'));
    else instance.pause();
  }
  function seek(offset) {
    const instance = player.current;
    if (!instance) return;
    const length = instance.duration();
    if (!Number.isFinite(length) || length <= 0) return;
    const target = Math.max(0, Math.min((instance.currentTime() || 0) + offset, length));
    instance.currentTime(target);
    setPosition(target);
    setSeekFeedback(`${offset > 0 ? '+' : '−'}${Math.abs(offset)}s · ${clockTime(target)}`);
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setSeekFeedback(''), 1000);
    revealControls();
  }
  async function fullscreen() {
    const changed = fullscreenElement() ? await leaveFullscreen() : await enterFullscreen(root.current);
    if (!changed) setNotice('Use your browser’s full screen option on this device.');
  }
  useEffect(() => {
    if (error) root.current.querySelector('.playback-error button')?.focus();
  }, [error]);
  useEffect(() => {
    const onKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const consume = () => { event.preventDefault(); event.stopPropagation(); };
      if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || [461, 10009].includes(event.keyCode)) {
        consume();
        if (fullscreenElement()) void leaveFullscreen().then(exited => { if (!exited) onClose(); });
        else onClose();
        return;
      }
      if (error) { moveFocus(event, root.current); return; }
      if (['ArrowLeft', 'ArrowRight', 'MediaRewind', 'MediaFastForward'].includes(event.key)) {
        consume();
        seek(['ArrowLeft', 'MediaRewind'].includes(event.key) ? -10 : 10);
        root.current.focus({ preventScroll: true });
        return;
      }
      if (event.key === 'MediaPlayPause'
        || (event.key === ' ' && !event.target.closest('button, a, input, select'))
        || (event.key === 'Enter' && !event.target.closest('button, a'))) {
        consume();
        if (!event.repeat) toggle();
        return;
      }
      if (['MediaPlay', 'MediaPause'].includes(event.key)) {
        consume(); revealControls();
        if (event.key === 'MediaPlay') player.current?.play()?.catch(() => setNotice('Select Play to begin.'));
        else player.current?.pause();
        return;
      }
      if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
        consume(); revealControls();
        // Left/right always seek. Up/down let a remote reach the optional buttons.
        const controls = [...root.current.querySelectorAll('[data-player-control]:not(:disabled)')];
        const index = controls.indexOf(document.activeElement);
        const target = index < 0 ? root.current.querySelector('[data-player-primary]')
          : controls[(index + (event.key === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length];
        requestAnimationFrame(() => target?.focus({ preventScroll: true }));
        return;
      }
      if (event.key === 'Tab') {
        consume(); revealControls();
        requestAnimationFrame(() => {
          const controls = [...root.current.querySelectorAll('[data-player-control]:not(:disabled)')];
          const index = controls.indexOf(document.activeElement);
          controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
        });
      }
    };
    // Playback errors can remove the focused control and leave focus on BODY.
    // Keep Back available even when no descendant of the player owns focus.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, error, revealControls]);

  return <div className={`player-screen${showControls ? '' : ' controls-hidden'}`} ref={root} role="dialog" aria-modal="true" aria-label="Video player" tabIndex={-1}
    onPointerDown={revealControls} onPointerMove={() => {
      if (Date.now() - lastPointer.current > 150) { lastPointer.current = Date.now(); revealControls(); }
    }}>
    <header className="player-header" inert={!showControls ? true : undefined}>
      <button data-player-control className="button subtle" onClick={onClose}><ArrowLeft /> Back to library</button>
      <div><strong>{info.title}</strong><span>{info.year} {info.resolution} {info.format}</span></div>
    </header>
    <div className="video-stage" data-vjs-player onClick={toggle}><div ref={host} className="video-host" /></div>
    {seekFeedback && !error && <div className="seek-feedback" role="status">{seekFeedback}</div>}
    {error && <div className="playback-error" role="alert">
      <AlertCircle size={36} /><h2>This video could not play here</h2>
      <p>The browser may not support this file’s video or audio format. Google may also be blocking the download.</p>
      <p>For the widest TV support, try an MP4 with H.264 video and AAC audio. This app plays the original file without converting it.</p>
      <div className="actions"><button className="button primary" onClick={onClose}><ArrowLeft /> Back to library</button>
        <a className="button secondary" href={`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`} target="_blank" rel="noreferrer"><ExternalLink /> Open in Drive</a></div>
    </div>}
    {!error && <footer className="player-footer" inert={!showControls ? true : undefined}>
      <div className="player-timeline"><span>{clockTime(position)}</span><input data-player-control aria-label="Seek" type="range" min="0" max={duration || 1} step="1" value={Math.min(position, duration || 1)} disabled={!duration} onChange={event => {
        const target = Number(event.target.value);
        player.current?.currentTime(target); setPosition(target); revealControls();
      }} /><span>{clockTime(duration)}</span></div>
      <div className="player-actions">
        <button data-player-control className="button secondary" aria-label="Rewind 10 seconds" onClick={() => seek(-10)}><RotateCcw /><span>10s</span></button>
        <button data-player-control data-player-primary className="button primary" aria-label={paused ? 'Resume playback' : 'Pause playback'} onClick={toggle}>{paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}<span>{paused ? 'Play' : 'Pause'}</span></button>
        <button data-player-control className="button secondary" aria-label="Forward 10 seconds" onClick={() => seek(10)}><RotateCw /><span>10s</span></button>
        <button data-player-control className="button secondary" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={fullscreen}><Maximize /><span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span></button>
      </div>
      <p className="player-hint" role="status">{notice || (slow && waiting ? 'Still loading. If playback does not start, try an H.264 / AAC MP4.' : waiting ? 'Opening your video…' : '← / → seek 10s · OK plays / pauses · ↑ / ↓ show controls · Back exits fullscreen, then returns to your library.')}{resume > 0 && waiting ? ` Resuming from ${clockTime(resume)}.` : ''}</p>
    </footer>}
  </div>;
}
