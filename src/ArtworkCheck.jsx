import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { checkArtworkConnection } from './tmdb.js';

const labels = {
  working: 'Working', failed: 'Failed', timeout: 'Timed out',
  'not-configured': 'Not configured', 'not-tested': 'Not tested', 'no-image': 'No test image available',
};

export default function ArtworkCheck({ token, onClose, onRefresh }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    checkArtworkConnection({ token, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ lookup: 'failed', image: 'not-tested' });
    });
    return () => controller.abort();
  }, [token, attempt]);

  return <Modal label="Artwork check" onClose={onClose}>
    <h2>Artwork check</h2>
    <p className="muted">Check movie information and image loading on this device.</p>
    {!result ? <p role="status">Checking…</p> : <>
      <dl className="artwork-check-results">
        <div><dt>TMDB lookup</dt><dd>{labels[result.lookup]}{result.status && result.lookup !== 'working' ? ` (HTTP ${result.status})` : ''}</dd></div>
        <div><dt>Image loading</dt><dd>{labels[result.image]}</dd></div>
      </dl>
      <p className="muted">{result.lookup !== 'working'
        ? 'Movie information is unavailable. Check this browser’s content blocking and connection settings.'
        : result.image !== 'working' ? 'Movie information loads, but images do not. Check this browser’s image and content-blocking settings.'
          : 'Movie information and images are reachable. Refresh the library to retry its artwork.'}</p>
    </>}
    <div className="actions">
      <button className="button primary" disabled={!result} onClick={() => { onRefresh(); onClose(); }}>Refresh library</button>
      <button className="button secondary" disabled={!result} onClick={() => setAttempt(value => value + 1)}>Retry check</button>
    </div>
  </Modal>;
}
