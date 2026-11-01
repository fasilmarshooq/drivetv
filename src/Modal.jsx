import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ label, onClose, children, className = '' }) {
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...root.current.querySelectorAll('button, input, a[href], [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
    (root.current.querySelector('[data-first-focus]') || focusable()[0])?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current.addEventListener('keydown', trap);
    const element = root.current;
    return () => {
      element.removeEventListener('keydown', trap);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className="modal-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={root} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label}>
      <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X /></button>
      {children}
    </section>
  </div>;
}
