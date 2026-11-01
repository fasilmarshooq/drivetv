import React, { useState } from 'react';

export default function Artwork({ title = 'Movie night', className = '', artwork, eager = false }) {
  const [failedUrls, setFailedUrls] = useState([]);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const source = [artwork?.backdropUrl, artwork?.posterUrl].find(url => url && !failedUrls.includes(url));
  const canLoad = Boolean(source);
  const ready = canLoad && loadedUrl === source;
  return <div className={`title-art ${className}${ready ? ' has-artwork' : ''}`} aria-hidden="true">
    {canLoad && <img className={`movie-artwork${ready ? ' is-loaded' : ''}`} src={source} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={event => {
      if (event.currentTarget.naturalWidth > 0) setLoadedUrl(source);
      else setFailedUrls(current => [...current, source]);
    }} onError={() => setFailedUrls(current => [...current, source])} />}
    {!ready && <>
      <div className="art-light" /><div className="art-frame" /><span>{title}</span><div className="art-grain" />
    </>}
  </div>;
}
