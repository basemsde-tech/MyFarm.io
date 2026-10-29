import React, { useEffect, useId, useRef, useState } from 'react';
import { parseCents, parseQty, fromCents } from '../core/money.mjs';
import { useApp } from './store.jsx';

const P = {
  cash: 'M3 7h18v10H3zM7 12h.01M17 12h.01M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.2 3.2 0 0 1 0 6.3M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  cow: 'M5 8c-1.5 0-2.5-1-3-2.5 1.5 0 2.5.3 3.3.9M19 8c1.5 0 2.5-1 3-2.5-1.5 0-2.5.3-3.3.9M6 7.5C7 6 9.3 5 12 5s5 1 6 2.5c.7 1.1 1 2.6 1 4.2 0 2-.8 3.6-2 4.6V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-2.7c-1.2-1-2-2.6-2-4.6 0-1.6.3-3.1 1-4.2zM9.5 17.5h.01M14.5 17.5h.01',
  milk: 'M8 2h8M9 2v3.5L6 10v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10l-3-4.5V2M6 13h12',
  receipt: 'M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21zM9 8h6M9 12h6M9 16h3',
  truck: 'M2 6h12v10H2zM14 9h4l4 4v3h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cart: 'M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2M9.5 20.5h.01M17.5 20.5h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  back: 'M15 18l-6-6 6-6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2c2.5 2.7 3.8 6.1 3.8 10s-1.3 7.3-3.8 10c-2.5-2.7-3.8-6.1-3.8-10S9.5 4.7 12 2z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  chev: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  popout: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  dock: 'M4 5h16v14H4zM4 9h16M9 14l3 3 3-3M12 17v-6',
  minus: 'M6 12h12',
  maximize: 'M5 5h14v14H5z',
  restore: 'M8 8h11v11H8zM5 16V5h11',
  egg: 'M12 3c3.5 0 6.5 5.2 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.2 8.5 3 12 3z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  wifi: 'M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4.3-2.4M15 10.4a10 10 0 0 1 4 2.2M12 20h.01',
};

export function Icon({ name, size = 18, className = '', style }) {
  return (
    <svg className={`ico ${className}`} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.more} />
    </svg>
  );
}

export function Button({ variant = 'quiet', size, icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Field({ label, hint, error, warn, children, id, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? <div className="field-msg err">{error}</div> : warn ? <div className="field-msg warn">{warn}</div> : hint ? <div className="field-msg">{hint}</div> : null}
    </div>
  );
}

export function TextInput({ label, hint, error, value, onChange, id, className, ...rest }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} id={fid} className={className}>
      <input id={fid} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, id, ...rest }) {
  const auto = useId();
  return (
    <Field label={label} id={id || auto}>
      <textarea id={id || auto} className="input" rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function Select({ label, value, onChange, options, id, hint, error, className, placeholder }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} id={fid} hint={hint} error={error} className={className}>
      <select id={fid} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

/** Searchable picker for long lists (customers, suppliers, bills). */
export function Picker({ label, value, onChange, options, placeholder, id, error, allowEmpty }) {
  const { t } = useApp();
  const auto = useId();
  const fid = id || auto;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const sel = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  const list = options.filter((o) => !q || `${o.label} ${o.sub || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Field label={label} id={fid} error={error}>
      <div className="picker" ref={ref}>
        <button type="button" id={fid} className="input picker-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className={sel ? '' : 'muted'}>{sel ? sel.label : placeholder || t('select')}</span>
          {sel?.sub && <span className="picker-sub">{sel.sub}</span>}
          <Icon name="down" size={16} />
        </button>
        {open && (
          <div className="picker-pop" role="listbox">
            <input autoFocus className="input" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="picker-list">
              {allowEmpty && <button type="button" className="picker-opt" onClick={() => { onChange(''); setOpen(false); }}>{allowEmpty}</button>}
              {list.slice(0, 80).map((o) => (
                <button type="button" key={o.value} className={`picker-opt ${o.value === value ? 'on' : ''}`} onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}>
                  <span>{o.label}</span>{o.sub && <span className="picker-sub">{o.sub}</span>}
                </button>
              ))}
              {!list.length && <div className="picker-empty">{t('cmd.none')}</div>}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

/**
 * Money field. Holds the raw text so typing feels natural; reports cents up.
 * Optional quick chips (cashier denominations) and an on-screen keypad.
 */
export function MoneyInput({ label, cents, onCents, hint, error, chips, id, autoFocus, keypad, big }) {
  const { t } = useApp();
  const auto = useId();
  const fid = id || auto;
  const [text, setText] = useState(cents ? String(fromCents(cents)) : '');
  const [pad, setPad] = useState(false);
  const last = useRef(cents);
  useEffect(() => {
    if (cents !== last.current) {
      last.current = cents;
      const p = parseCents(text);
      if (!p.ok || p.cents !== cents) setText(cents ? String(fromCents(cents)) : '');
    }
  }, [cents]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = parseCents(text);
  const set = (s) => {
    setText(s);
    const p = parseCents(s);
    if (p.ok) { last.current = p.cents; onCents(p.cents); }
  };
  const press = (k) => {
    if (k === '⌫') return set(text.slice(0, -1));
    if (k === 'C') return set('');
    if (k === '.' && text.includes('.')) return;
    set(text + k);
  };
  return (
    <Field label={label} hint={hint} error={error || (!parsed.ok ? t('e.notNumber') : null)} id={fid}>
      <div className={`money-in ${big ? 'big' : ''}`}>
        <input id={fid} className="input num" inputMode="decimal" autoComplete="off" autoFocus={autoFocus}
          value={text} onChange={(e) => set(e.target.value)} placeholder="0.00" />
        {keypad && <IconButton icon="more" label="keypad" onClick={() => setPad(!pad)} />}
      </div>
      {chips?.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <button type="button" key={c.label} className="chip" onClick={() => { const v = typeof c.cents === 'function' ? c.cents(cents) : c.cents; setText(v ? String(fromCents(v)) : ''); last.current = v; onCents(v); }}>{c.label}</button>
          ))}
        </div>
      )}
      {pad && (
        <div className="keypad">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => (
            <button type="button" key={k} onClick={() => press(k)}>{k}</button>
          ))}
        </div>
      )}
    </Field>
  );
}

export function QtyInput({ label, value, onValue, unit, hint, error, id, autoFocus }) {
  const { t } = useApp();
  const auto = useId();
  const fid = id || auto;
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? String(value) : ''); }
  }, [value]);
  const p = parseQty(text);
  return (
    <Field label={label} hint={hint} error={error || (!p.ok ? t('e.notNumber') : null)} id={fid}>
      <div className="qty-in">
        <input id={fid} className="input num" inputMode="decimal" autoFocus={autoFocus} value={text} placeholder="0"
          onChange={(e) => { setText(e.target.value); const q = parseQty(e.target.value); if (q.ok) { last.current = q.value; onValue(q.value); } }} />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </Field>
  );
}

export function DateInput({ label, value, onChange, max, min, id, error }) {
  const auto = useId();
  return (
    <Field label={label} id={id || auto} error={error}>
      <input id={id || auto} type="date" className="input num" value={value || ''} max={max} min={min} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Seg({ value, onChange, options, label, small, wrap }) {
  return (
    <div className={`seg-wrap ${wrap ? 'wrap' : ''}`}>
      {label && <div className="seg-label">{label}</div>}
      <div className={`seg ${small ? 'seg-sm' : ''}`} role="radiogroup">
        {options.map((o) => (
          <button type="button" role="radio" aria-checked={value === o.value} key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
            {o.icon && <span className="seg-ico">{o.icon}</span>}{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Check({ label, checked, onChange, hint }) {
  const id = useId();
  return (
    <div className="check">
      <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}{hint && <small>{hint}</small>}</label>
    </div>
  );
}

const TONE = { paid: 'good', clear: 'good', fresh: 'good', good: 'good', healthy: 'good', laying: 'good', lactating: 'good', partial: 'warn', aging: 'warn', served: 'info', pregnant: 'info', unpaid: 'neutral', owing: 'warn', overdue: 'bad', old: 'bad', sick: 'bad', voided: 'neutral', deleted: 'neutral', dry: 'neutral', credit: 'info', growing: 'info', stopped: 'neutral', sold: 'neutral', dead: 'bad', edited: 'neutral', afterClose: 'warn' };
export function Pill({ status, tone, children }) {
  return <span className={`pill pill-${tone || TONE[status] || 'neutral'}`}>{children}</span>;
}

export function Empty({ title, body, action, icon = 'file' }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div className="empty-title">{title}</div>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Sheet({ title, onClose, children, footer, wide, sub }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const close = React.useCallback(() => {
    if (closing) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return onClose();
    setClosing(true);
    setTimeout(onClose, 170);
  }, [closing, onClose]);
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [close]);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className={`scrim ${closing ? 'is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <span className="sheet-grab" aria-hidden="true" />
        <header className="sheet-head">
          <div>
            <h2>{title}</h2>
            {sub && <div className="sheet-sub">{sub}</div>}
          </div>
          <IconButton icon="close" label="close" onClick={close} />
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Animate a number to its new value (respects reduced motion). */
export function useCountUp(value, ms = 650) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === value) { from.current = value; setShown(value); return undefined; }
    const a = from.current;
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Small area chart drawn to one scale; the last point is emphasised. */
export function Sparkline({ points, width = 260, height = 64, label }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(0, ...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 4;
  const x = (i) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const lx = x(points.length - 1), ly = y(points[points.length - 1]);
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--gold-bright)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--gold-bright)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--gold-bright)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="spark-line" pathLength="1" />
      <circle cx={lx} cy={ly} r="3.5" fill="var(--gold-bright)" />
    </svg>
  );
}

export function Stat({ label, value, sub, tone, onClick, big }) {
  const El = onClick ? 'button' : 'div';
  return (
    <El type={onClick ? 'button' : undefined} className={`stat ${tone ? `stat-${tone}` : ''} ${big ? 'stat-big' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </El>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((x) => (
        <button type="button" role="tab" aria-selected={value === x.value} key={x.value} className={value === x.value ? 'on' : ''} onClick={() => onChange(x.value)}>
          {x.label}{x.count != null && <span className="tab-count">{x.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Long lists render in pages so a big farm stays fast. Month groups collapse. */
export function Grouped({ rows, groupKey, renderGroup, renderRow, pageSize = 40, collapsedDefault = (i) => i > 1 }) {
  const [limit, setLimit] = useState(pageSize);
  const [collapsed, setCollapsed] = useState({});
  const { t } = useApp();
  const groups = [];
  let cur = null;
  for (const r of rows.slice(0, limit)) {
    const k = groupKey(r);
    if (!cur || cur.key !== k) { cur = { key: k, rows: [] }; groups.push(cur); }
    cur.rows.push(r);
  }
  return (
    <div className="grouped">
      {groups.map((g, i) => {
        const isC = collapsed[g.key] ?? collapsedDefault(i);
        return (
          <section key={g.key} className="group">
            <button type="button" className="group-head" onClick={() => setCollapsed({ ...collapsed, [g.key]: !isC })} aria-expanded={!isC}>
              <Icon name={isC ? 'chev' : 'down'} size={16} className="flip-rtl" />
              {renderGroup(g)}
            </button>
            {!isC && <div className="group-rows">{g.rows.map(renderRow)}</div>}
          </section>
        );
      })}
      {rows.length > limit && <Button className="more-btn" onClick={() => setLimit(limit + pageSize)}>{t('more')} ({rows.length - limit})</Button>}
    </div>
  );
}

export function Avatar({ p, size = 32 }) {
  return <span className="avatar" style={{ width: size, height: size, background: p?.color || 'var(--teal-soft)', fontSize: size * 0.5 }}>{p?.avatar || '🙂'}</span>;
}

export function readImage(file, max = 640, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function monthLabel(key, lang) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 15);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' });
}
export function dayLabel(day, lang, opts = { day: 'numeric', month: 'short' }) {
  if (!day || day.startsWith('0000')) return '—';
  return new Date(day + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', opts);
}
