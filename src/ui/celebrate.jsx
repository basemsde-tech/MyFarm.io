// Playful moments: a small scene when something worth smiling about is saved — milk (a cow with a
// sunrise or dusk), eggs (a hen), a sale (coins), a payment (a coin jar), a supplier paid (a truck),
// an account paid up (confetti), a birth or a new animal (a calf), a backup (a shield).
// The store picks the moment (core/celebrate.mjs) and fires 'mz-celebrate'. Each kind can be turned
// off in Settings → Appearance and reading; nothing moves when the device asks for reduced motion.
// The card never blocks the screen: work carries on underneath, a tap closes it.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './store.jsx';
import { milkQ } from './units.js';
import { fmtQty } from '../core/money.mjs';
import { playLater } from './sound.js';

const SOUND = { milk: 'moo', eggs: 'cluck', sale: 'coins', payment: 'jar', supplierPay: 'honk', clear: 'fanfare', birth: 'calf', animal: 'calf', backup: 'chime' };

export const KINDS = ['milk', 'eggs', 'sale', 'payment', 'supplierPay', 'clear', 'birth', 'animal', 'backup'];

/** Show a moment by hand (previews in Settings, a finished backup). */
export function celebrate(detail) {
  try { window.dispatchEvent(new CustomEvent('mz-celebrate', { detail })); } catch { /* old browsers */ }
}
/** Older call kept for compatibility. */
export const celebrateMilk = ({ am = 0, pm = 0 } = {}) => (am > 0 || pm > 0) && celebrate({ kind: 'milk', am, pm });

/** Example data for each kind, for the preview buttons. */
export const SAMPLE = { milk: { kind: 'milk', am: 42.5, pm: 0 }, eggs: { kind: 'eggs', n: 36 }, sale: { kind: 'sale', amountC: 12500 }, payment: { kind: 'payment', amountC: 30000 }, supplierPay: { kind: 'supplierPay', amountC: 21000 }, clear: { kind: 'clear', party: 'customer', amountC: 63900 }, birth: { kind: 'birth', n: 1 }, animal: { kind: 'animal', n: 1 }, backup: { kind: 'backup' } };

function useCountUp(to, ms) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!to) { setV(0); return undefined; }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(to); return undefined; }
    let raf; const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / ms); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

export function Cow() {
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


function Hen() {
  return (
    <svg className="cel-hen" viewBox="0 0 120 110" aria-hidden="true">
      <g className="hen-body">
        <path d="M30 70 q-6 -34 24 -40 q24 -4 34 16 q12 -4 16 6 q-8 4 -14 2 q4 30 -26 36 q-28 4 -34 -20z" fill="#fff6e8" stroke="#5a4636" strokeWidth="3" />
        <path className="hen-wing" d="M46 66 q14 -12 30 0 q-10 14 -30 0z" fill="#f1dcc0" stroke="#5a4636" strokeWidth="2.5" />
        <path d="M62 24 q4 -10 10 -4 q4 -8 9 -1 q6 -3 5 6 q-10 4 -24 -1z" fill="#e2453c" stroke="#5a4636" strokeWidth="2" />
        <circle cx="78" cy="38" r="3" fill="#2b2b2b" />
        <path d="M88 42 l10 4 l-10 4z" fill="#f2a516" stroke="#5a4636" strokeWidth="2" strokeLinejoin="round" />
        <path d="M84 50 q3 8 -3 10" fill="#e2453c" />
        <path d="M50 92 v10 M64 92 v10" stroke="#f2a516" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
function Basket() {
  return (
    <svg className="cel-basket" viewBox="0 0 70 50" aria-hidden="true">
      <ellipse cx="22" cy="20" rx="8" ry="10" fill="#fff8ec" stroke="#c9a27a" strokeWidth="2" />
      <ellipse cx="38" cy="18" rx="8" ry="10" fill="#f6e3c8" stroke="#c9a27a" strokeWidth="2" />
      <ellipse cx="52" cy="21" rx="7" ry="9" fill="#fff8ec" stroke="#c9a27a" strokeWidth="2" />
      <path d="M6 24 h58 l-6 22 h-46z" fill="#c98a4a" stroke="#7a5230" strokeWidth="2.5" />
      <path d="M12 30 h46 M14 38 h42" stroke="#a86d36" strokeWidth="2" />
    </svg>
  );
}
function Coins() {
  return (
    <svg className="cel-coins" viewBox="0 0 120 100" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <g key={i} transform={`translate(0 ${-i * 11})`}><ellipse cx="60" cy="86" rx="34" ry="10" fill="#f5c542" stroke="#9a7413" strokeWidth="2.5" /><rect x="26" y="78" width="68" height="8" fill="#f5c542" /><ellipse cx="60" cy="78" rx="34" ry="10" fill="#ffd966" stroke="#9a7413" strokeWidth="2.5" /></g>)}
      <text x="60" y="49" textAnchor="middle" fontSize="16" fontWeight="800" fill="#9a7413">$</text>
    </svg>
  );
}
function Jar() {
  return (
    <svg className="cel-jar" viewBox="0 0 90 110" aria-hidden="true">
      <rect x="22" y="10" width="46" height="12" rx="4" fill="#9fb3c8" stroke="#56677a" strokeWidth="2.5" />
      <path d="M18 24 h54 q6 0 6 8 v58 q0 12 -12 12 h-42 q-12 0 -12 -12 v-58 q0 -8 6 -8z" fill="rgba(220,236,248,.65)" stroke="#56677a" strokeWidth="3" />
      {[0, 1, 2].map((i) => <ellipse key={i} cx={34 + i * 11} cy={92 - i * 7} rx="12" ry="4.5" fill="#f5c542" stroke="#9a7413" strokeWidth="2" />)}
      <path d="M28 40 v40" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
function Truck() {
  return (
    <svg className="cel-truck" viewBox="0 0 160 90" aria-hidden="true">
      <rect x="8" y="24" width="84" height="44" rx="6" fill="#2e86c1" stroke="#1d4e73" strokeWidth="3" />
      <path d="M92 38 h28 l18 18 v12 h-46z" fill="#5fa8d8" stroke="#1d4e73" strokeWidth="3" strokeLinejoin="round" />
      <path d="M100 42 h16 l10 10 h-26z" fill="#dff1fb" />
      <text x="50" y="52" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">✓</text>
      <g className="truck-wheels"><circle cx="34" cy="70" r="10" fill="#2b2b2b" /><circle cx="34" cy="70" r="4" fill="#ccc" /><circle cx="116" cy="70" r="10" fill="#2b2b2b" /><circle cx="116" cy="70" r="4" fill="#ccc" /></g>
    </svg>
  );
}
function Shield() {
  return (
    <svg className="cel-shield" viewBox="0 0 100 110" aria-hidden="true">
      <path d="M50 6 l38 14 v28 c0 26 -16 44 -38 54 c-22 -10 -38 -28 -38 -54 v-28z" fill="#1b8a75" stroke="#0f5a4c" strokeWidth="3" />
      <path className="shield-check" d="M30 54 l14 14 l26 -28" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Calf() {
  return (
    <svg className="cel-calf" viewBox="0 0 140 110" aria-hidden="true">
      <rect x="44" y="46" width="66" height="40" rx="20" fill="#f3d7b6" stroke="#5a4636" strokeWidth="3" />
      <path d="M70 50 q10 4 6 14 q-10 2 -14 -6z" fill="#fff" />
      <g stroke="#5a4636" strokeWidth="3" fill="#f3d7b6"><rect x="52" y="78" width="9" height="22" rx="4" /><rect x="66" y="80" width="9" height="20" rx="4" /><rect x="88" y="80" width="9" height="20" rx="4" /><rect x="100" y="78" width="9" height="22" rx="4" /></g>
      <g className="calf-head">
        <path d="M18 34 q-10 -4 -12 -12 q10 0 16 6z M50 34 q10 -4 12 -12 q-10 0 -16 6z" fill="#f3d7b6" stroke="#5a4636" strokeWidth="2.5" />
        <rect x="18" y="22" width="34" height="40" rx="16" fill="#f3d7b6" stroke="#5a4636" strokeWidth="3" />
        <circle cx="28" cy="38" r="3.4" fill="#2b2b2b" /><circle cx="42" cy="38" r="3.4" fill="#2b2b2b" />
        <rect x="22" y="46" width="26" height="15" rx="7.5" fill="#f7b6c2" stroke="#5a4636" strokeWidth="2.5" />
        <circle cx="30" cy="53" r="2" fill="#5a4636" /><circle cx="40" cy="53" r="2" fill="#5a4636" />
      </g>
    </svg>
  );
}

const PHRASES = { en: ['Nice work', 'Well done', 'Great job', 'Lovely', 'Brilliant'], ar: ['أحسنت', 'عمل رائع', 'رائع', 'ممتاز', 'تسلم يداك'] };

export function Celebration() {
  const app = useApp();
  const { t, prefs, fmt, lang, actor, names } = app;
  const [show, setShow] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const on = (e) => {
      const d = e.detail || {};
      if (prefs.playful === false || prefs.playfulOff?.[d.kind]) return;
      clearTimeout(timer.current);
      const phrase = (PHRASES[lang] || PHRASES.en)[Math.floor(Math.random() * 5)];
      setShow({ ...d, key: Date.now(), phrase });
      if (prefs.playfulSound !== false && SOUND[d.kind]) playLater(SOUND[d.kind], d.preview ? 60 : 420);
      timer.current = setTimeout(() => setShow(null), d.kind === 'clear' || d.kind === 'birth' ? 3800 : 3000);
    };
    const legacy = (e) => on({ detail: { kind: 'milk', ...(e.detail || {}) } });
    window.addEventListener('mz-celebrate', on);
    window.addEventListener('mz-cow', legacy);
    return () => { window.removeEventListener('mz-celebrate', on); window.removeEventListener('mz-cow', legacy); clearTimeout(timer.current); };
  }, [prefs.playful, prefs.playfulOff, prefs.playfulSound, lang]);
  useEffect(() => {
    if (!show) return undefined;
    const key = (e) => { if (e.key === 'Escape') setShow(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [show]);
  const total = !show ? 0 : show.kind === 'milk' ? (show.am || 0) + (show.pm || 0) : show.kind === 'eggs' ? show.n || 0 : show.amountC || 0;
  const shown = useCountUp(total, 1300);
  if (!show) return null;
  const k = show.kind;
  const milkScene = k === 'milk' ? (show.am && show.pm ? 'both' : show.am ? 'am' : 'pm') : null;
  const scene = milkScene ? `milk-${milkScene}` : k;
  const first = (actor?.name || '').split(' ')[0];
  const who = k === 'clear' ? (!show.id ? '' : show.party === 'supplier' ? names.supplier(show.id) : names.customer(show.id)) : k === 'sale' && show.customerId ? names.customer(show.customerId) : k === 'payment' && show.customerId ? names.customer(show.customerId) : k === 'supplierPay' && show.supplierId ? names.supplier(show.supplierId) : (k === 'birth' || k === 'animal') && show.animalId ? names.animal(show.animalId) : '';
  const title = milkScene ? t(`cow.${milkScene}`) : k === 'clear' ? t(show.party === 'supplier' ? 'cel.clearSup' : 'cel.clear') : t(`cel.${k}`, { n: show.n || 1 });
  const figure = k === 'milk' ? milkQ(shown) : k === 'eggs' ? `${fmtQty(Math.round(shown), 0)} ${t('u.egg')}` : ['sale', 'payment', 'supplierPay', 'clear'].includes(k) ? fmt(Math.round(shown)) : null;
  const bubble = { milk: t('cow.moo'), eggs: t('cel.cluck'), birth: t('cel.moo2'), animal: t('cel.hello') }[k];
  return createPortal(
    <div className={`cel-layer scene-${scene}`} key={show.key} role="status" aria-live="polite">
      {(k === 'clear' || k === 'birth') && <div className="cel-confetti" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ '--i': i, '--x': `${(i * 37 + 11) % 100}%`, '--d': `${((i * 53) % 17) * 0.06}s`, '--t': `${2 + ((i * 29) % 13) * 0.09}s`, '--dx': `${((i * 71) % 120) - 60}px` }} />)}</div>}
      <div className="cel-card" onClick={() => setShow(null)} title={t('close')}>
        <div className="cel-sky">
          {(scene === 'milk-am' || scene === 'milk-both' || k === 'eggs') && <div className="cow-sun" />}
          {(scene === 'milk-pm' || scene === 'milk-both') && <div className="cow-moon"><span /><i /><i /><i /></div>}
          {k === 'birth' && <div className="cel-hearts" aria-hidden="true"><i /><i /><i /><i /></div>}
          {['sale', 'payment', 'clear', 'backup'].includes(k) && <div className="cel-sparkles" aria-hidden="true"><i /><i /><i /><i /><i /></div>}
          <div className="cow-hill" />
          <div className="cow-stage">
            {bubble && <div className="cow-moo">{bubble}</div>}
            {k === 'milk' && <><Cow /><Bucket fill={Math.min(1, total ? shown / total : 0)} /><span className="cow-drop d1" /><span className="cow-drop d2" /><span className="cow-drop d3" /></>}
            {k === 'eggs' && <><Hen /><Basket /><span className="cel-egg e1" /><span className="cel-egg e2" /></>}
            {k === 'sale' && <><Coins /><span className="cel-coin c1" /><span className="cel-coin c2" /><span className="cel-coin c3" /></>}
            {k === 'payment' && <><Jar /><span className="cel-coin drop c1" /><span className="cel-coin drop c2" /></>}
            {k === 'supplierPay' && <Truck />}
            {k === 'clear' && <div className="cel-badge"><span>✓</span></div>}
            {(k === 'birth' || k === 'animal') && <Calf />}
            {k === 'backup' && <Shield />}
          </div>
        </div>
        <div className="cow-text">
          <b>{title}</b>
          {figure && <span className="cow-litres num">{figure}</span>}
          {who && <span className="cel-who">{who}</span>}
          {scene === 'milk-both' && <small className="muted">{t('cow.split', { a: milkQ(show.am), b: milkQ(show.pm) })}</small>}
          <small className="cel-phrase">{show.phrase}{first ? `${lang === 'ar' ? '،' : ','} ${first}` : ''}!</small>
        </div>
      </div>
    </div>, document.body);
}
/** Older name kept for compatibility. */
export const CowCelebration = Celebration;

/** The dancing cow for refreshing and updating (instead of a spinner), when playful moments are on. */
export function DancingCow() {
  return (
    <div className="dance" aria-hidden="true">
      <div className="dance-floor" />
      <div className="dance-notes"><i>♪</i><i>♫</i><i>♪</i><i>♬</i></div>
      <div className="dance-cow"><Cow /></div>
    </div>
  );
}
