// Browsers can mask their user agent; unknown devices keep the manual control.
export function isTVBrowser(agent = '') {
  return /com\.tcl\.browser|BrowseHere|TBrowser|\bNETTV\b|Android TV|GoogleTV|Smart[ -]?TV|HbbTV|BRAVIA|MiTV|MIBOX|\bAFT\w+/i.test(agent);
}

export function fullscreenElement(doc = globalThis.document) {
  return doc?.fullscreenElement || doc?.webkitFullscreenElement || null;
}

export function enterFullscreen(element) {
  const request = element?.requestFullscreen || element?.webkitRequestFullscreen;
  if (typeof request !== 'function') return Promise.resolve(false);
  try { return Promise.resolve(request.call(element)).then(() => true, () => false); }
  catch { return Promise.resolve(false); }
}

export function leaveFullscreen(doc = globalThis.document) {
  const exit = doc?.exitFullscreen || doc?.webkitExitFullscreen;
  if (!fullscreenElement(doc) || typeof exit !== 'function') return Promise.resolve(false);
  try { return Promise.resolve(exit.call(doc)).then(() => true, () => false); }
  catch { return Promise.resolve(false); }
}
