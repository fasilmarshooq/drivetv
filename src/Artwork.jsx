import React, { useState } from 'react';

export default function Artwork({ title = 'Movie night', className = '', artwork, eager = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const source = artwork?.backdropUrl || artwork?.posterUrl;
  const canLoad = source && source !== failedUrl;
  const ready = canLoad && loadedUrl === source;
  return <div className={`title-art ${className}${ready ? ' has-artwork' : ''}`} aria-hidden="true">
    {canLoad && <img className={`movie-artwork${ready ? ' is-loaded' : ''}`} src={source} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={async event => {
      try {
        const image = event.currentTarget;
        if (image.decode) await image.decode();
        setLoadedUrl(source);
      } catch { setFailedUrl(source); }
    }} onError={() => setFailedUrl(source)} />}
    {!ready && <>
      <div className="art-light" /><div className="art-frame" /><span>{title}</span><div className="art-grain" />
    </>}
  </div>;
}
