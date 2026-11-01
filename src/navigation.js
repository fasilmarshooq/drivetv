export function nextControl(origin, candidates, direction) {
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
  const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  const from = center(origin);
  let best = null;
  let score = Infinity;
  for (const candidate of candidates) {
    const to = center(candidate);
    const forward = (horizontal ? to.x - from.x : to.y - from.y) * sign;
    const side = Math.abs(horizontal ? to.y - from.y : to.x - from.x);
    if (forward < 4) continue;
    const value = forward + side * 3;
    if (value < score) { score = value; best = candidate; }
  }
  return best;
}

export function moveFocus(event, root = document) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const active = document.activeElement;
  if (active?.matches('select, [role="slider"], input[type="range"]')) return;
  if (active?.matches('input, textarea') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const elements = [...root.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
    .filter(element => element.getClientRects().length && !element.closest('[hidden], [inert]'));
  const candidates = elements.filter(element => element !== active).map(element => ({ element, ...rectangle(element) }));
  const target = active && root.contains(active) ? nextControl(rectangle(active), candidates, event.key) : candidates[0];
  if (target) {
    event.preventDefault();
    target.element.focus({ preventScroll: true });
    target.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function rectangle(element) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}
