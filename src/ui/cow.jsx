// A small, playful confirmation when milk is saved: a happy cow, a filling bucket and the litres
// counting up. Morning gets a sunrise, afternoon/evening a dusk sky. Off in Settings → Appearance
// (prefs.playful === false) and calm (no motion) when the device asks for reduced motion.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './store.jsx';
import { milkQ } from './units.js';

/** Ask for the cow: sessions = { am: litres|null, pm: litres|null }. */
export function celebrateMilk(sessions) {
  const am = Number(sessions?.am) || 0;
  const pm = Number(sessions?.pm) || 0;
  if (!(am > 0 || pm > 0)) return;
  try { window.dispatchEvent(new CustomEvent('mz-cow', { detail: { am, pm } })); } catch { /* old browsers */ }
}

function useCountUp(to, ms) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!to) return undefined;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(to); return undefined; }
    let raf; const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

function Cow() {
  return (
    <svg className="cow-svg" viewBox="0 0 200 160" aria-hidden="true">
      <g className="cow-tail"><path d="M150 78 q20 4 18 30" fill="none" stroke="#3a2f2a" strokeWidth="4" strokeLinecap="round" /><circle cx="168" cy="110" r="6" fill="#3a2f2a" /></g>
      <g className="cow-body">
        <rect x="58" y="62" width="96" height="58" rx="28" fill="#fff" stroke="#3a2f2a" strokeWidth="3" />
        <path d="M80 66 q14 6 8 22 q-12 4 -20 -8 q2 -10 12 -14z" fill="#3a2f2a" />
        <path d="M122 92 q16 -4 22 10 q-6 12 -20 8 q-8 -8 -2 -18z" fill="#3a2f2a" />
        <ellipse cx="106" cy="118" rx="14" ry="7" fill="#f7b6c2" stroke="#3a2f2a" strokeWidth="2" />
        <g className="cow-legs" stroke="#3a2f2a" strokeWidth="3" fill="#fff">
          <rect x="70" y="112" width="12" height="28" rx="5" /><rect x="90" y="114" width="12" height="26" rx="5" />
          <rect x="122" y="114" width="12" height="26" rx="5" /><rect x="140" y="112" width="12" height="28" rx="5" />
        </g>
      </g>
      <g className="cow-head">
        <path d="M30 48 q-14 -6 -16 -16 q12 0 20 8z" fill="#fff" stroke="#3a2f2a" strokeWidth="3" />
        <path d="M74 48 q14 -6 16 -16 q-12 0 -20 8z" fill="#fff" stroke="#3a2f2a" strokeWidth="3" />
        <path d="M38 34 q-4 -12 4 -16 M66 34 q4 -12 -4 -16" fill="none" stroke="#c9a27a" strokeWidth="5" strokeLinecap="round" />
        <rect x="30" y="30" width="44" height="52" rx="20" fill="#fff" stroke="#3a2f2a" strokeWidth="3" />
        <path d="M34 40 q8 -6 14 2 q-4 10 -14 6z" fill="#3a2f2a" />
        <g className="cow-eyes"><circle cx="43" cy="52" r="4" fill="#3a2f2a" /><circle cx="61" cy="52" r="4" fill="#3a2f2a" /><circle cx="44.5" cy="50.5" r="1.3" fill="#fff" /><circle cx="62.5" cy="50.5" r="1.3" fill="#fff" /></g>
        <circle cx="36" cy="62" r="4" fill="#f7b6c2" opacity=".8" /><circle cx="68" cy="62" r="4" fill="#f7b6c2" opacity=".8" />
        <rect x="34" y="62" width="36" height="22" rx="11" fill="#f7b6c2" stroke="#3a2f2a" strokeWidth="3" />
        <circle cx="45" cy="72" r="2.6" fill="#3a2f2a" /><circle cx="59" cy="72" r="2.6" fill="#3a2f2a" />
        <path d="M46 79 q6 4 12 0" fill="none" stroke="#3a2f2a" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Bucket({ fill }) {
  return (
    <svg className="cow-bucket" viewBox="0 0 60 64" aria-hidden="true">
      <defs><clipPath id="mz-bucket"><path d="M8 18 h44 l-5 40 a4 4 0 0 1 -4 4 h-26 a4 4 0 0 1 -4 -4z" /></clipPath></defs>
      <path d="M12 18 q18 -22 36 0" fill="none" stroke="#7b8794" strokeWidth="3" />
      <g clipPath="url(#mz-bucket)">
        <rect x="0" y="0" width="60" height="64" fill="#dfe6ec" />
        <rect className="cow-milk" x="0" y={62 - 44 * fill} width="60" height="64" fill="#fffdf6" />
        <path className="cow-wave" d={`M0 ${62 - 44 * fill} q8 -3 15 0 t15 0 t15 0 t15 0 v4 h-60z`} fill="#fff" />
      </g>
      <path d="M8 18 h44 l-5 40 a4 4 0 0 1 -4 4 h-26 a4 4 0 0 1 -4 -4z" fill="none" stroke="#7b8794" strokeWidth="3" />
    </svg>
  );
}

export function CowCelebration() {
  const { t, prefs } = useApp();
  const [show, setShow] = useState(null); // { am, pm, key }
  const timer = useRef(null);
  useEffect(() => {
    const on = (e) => {
      if (prefs.playful === false) return;
      clearTimeout(timer.current);
      setShow({ ...e.detail, key: Date.now() });
      timer.current = setTimeout(() => setShow(null), 3200);
    };
    window.addEventListener('mz-cow', on);
    return () => { window.removeEventListener('mz-cow', on); clearTimeout(timer.current); };
  }, [prefs.playful]);
  useEffect(() => {
    if (!show) return undefined;
    const key = (e) => { if (e.key === 'Escape') setShow(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [show]);
  const total = (show?.am || 0) + (show?.pm || 0);
  const shown = useCountUp(total, 1400);
  if (!show) return null;
  const scene = show.am && show.pm ? 'both' : show.am ? 'am' : 'pm';
  return createPortal(
    <div className={`cow-overlay scene-${scene}`} key={show.key} role="status" aria-live="polite" onClick={() => setShow(null)}>
      <div className="cow-card">
        <div className="cow-sky">
          {scene !== 'pm' && <div className="cow-sun" />}
          {scene !== 'am' && <div className="cow-moon"><span /><i /><i /><i /></div>}
          <div className="cow-hill" />
          <div className="cow-stage">
            <div className="cow-moo">{t('cow.moo')}</div>
            <Cow />
            <Bucket fill={Math.min(1, total ? shown / total : 0)} />
            <span className="cow-drop d1" /><span className="cow-drop d2" /><span className="cow-drop d3" />
          </div>
        </div>
        <div className="cow-text">
          <b>{t(`cow.${scene}`)}</b>
          <span className="cow-litres num">{milkQ(shown)}</span>
          {scene === 'both' && <small className="muted">{t('cow.split', { a: milkQ(show.am), b: milkQ(show.pm) })}</small>}
        </div>
      </div>
    </div>, document.body);
}
