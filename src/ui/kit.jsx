import React, { useEffect, useId, useRef, useState } from 'react';
import { parseCents, parseQty, fromCents } from '../core/money.mjs';
import { useApp } from './store.jsx';
import { Help } from './help.jsx';

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
  'role-owner': 'M4 18.5h16M5.2 18.5 4 8l4.6 3.6L12 5l3.4 6.6L20 8l-1.2 10.5M12 14.2h.01',
  'role-book': 'M6.5 3h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3zM8.5 6.5h7v3h-7zM8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01',
  'role-milker': 'M5 9h14l-1.6 10.2a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8zM8 9a4 4 0 0 1 8 0M9.5 13.5c1.2.8 3.8.8 5 0',
  'role-worker': 'M12 21.5V11M7 3v4a5 5 0 0 0 10 0V3M12 3v8',
  'role-health': 'M12 3l7 2.8v5.4c0 4.6-3 7.9-7 9.8-4-1.9-7-5.2-7-9.8V5.8zM12 9v6M9 12h6',
  backspace: 'M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM12 9.5l5 5M17 9.5l-5 5',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  popout: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  dock: 'M4 5h16v14H4zM4 9h16M9 14l3 3 3-3M12 17v-6',
  minus: 'M6 12h12',
  maximize: 'M5 5h14v14H5z',
  restore: 'M8 8h11v11H8zM5 16V5h11',
  egg: 'M12 3c3.5 0 6.5 5.2 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.2 8.5 3 12 3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rows: 'M4 5h16M4 9.5h16M4 14h16M4 18.5h16',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  up: 'M6 15l6-6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  ledger: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13zM6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2M15.5 14h2',
  whatsapp: 'M20.5 11.6a8.6 8.6 0 0 1-12.7 7.6L3.5 20.5l1.3-4.1A8.6 8.6 0 1 1 20.5 11.6zM9.1 7.9c-.4 0-.9.4-.9 1.2 0 2.6 3.4 6 6.4 6.3.8.1 1.4-.4 1.5-1l.1-.7-2-1-1 .9c-1.1-.5-2.2-1.6-2.6-2.6l.8-1-.9-2.1z',
  image: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.3a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.9M12 17h.01',
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

export function Select({ label, value, onChange, options, id, hint, error, className, placeholder, disabled }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} id={fid} hint={hint} error={error} className={className}>
      <select id={fid} className="input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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
    const k = groupKey ? groupKey(r) : '';
    if (!cur || cur.key !== k) { cur = { key: k, rows: [] }; groups.push(cur); }
    cur.rows.push(r);
  }
  if (!groupKey) {
    return (
      <div className="grouped flat">
        <div className="group-rows">{rows.slice(0, limit).map(renderRow)}</div>
        {rows.length > limit && <Button className="more-btn" onClick={() => setLimit(limit + pageSize)}>{t('more')} ({rows.length - limit})</Button>}
      </div>
    );
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

export const ROLE_TONE = { owner: 'gold', book: 'info', milker: 'teal', worker: 'earth', health: 'rose' };
/** A role symbol in a soft tile. Profiles carry no photos; the symbol says what the person does. */
export function Avatar({ p, size = 34, ring }) {
  const role = ROLE_TONE[p?.role] ? p.role : 'worker';
  return (
    <span className={`role-badge rb-${ROLE_TONE[role]} ${ring ? 'ring' : ''}`} style={{ inlineSize: size, blockSize: size, borderRadius: Math.round(size * 0.3) }} aria-hidden="true">
      <Icon name={`role-${role}`} size={Math.round(size * 0.56)} />
    </span>
  );
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

// Date formatters are costly to build; keep one per language and style.
const DTF = new Map();
const dtf = (lang, opts) => {
  const k = lang + JSON.stringify(opts);
  let f = DTF.get(k);
  if (!f) { f = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', opts); DTF.set(k, f); }
  return f;
};
const LABELS = new Map();
export function monthLabel(key, lang) {
  const k = `m${lang}${key}`;
  let s = LABELS.get(k);
  if (s == null) { const [y, m] = key.split('-'); s = dtf(lang, { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1, 15)); LABELS.set(k, s); }
  return s;
}
export function dayLabel(day, lang, opts = { day: 'numeric', month: 'short' }) {
  if (!day || day.startsWith('0000')) return '—';
  const k = `${lang}${day}${opts.day || ''}${opts.month || ''}${opts.year || ''}${opts.weekday || ''}`;
  let s = LABELS.get(k);
  if (s == null) { s = dtf(lang, opts).format(new Date(day + 'T12:00:00')); if (LABELS.size > 20000) LABELS.clear(); LABELS.set(k, s); }
  return s;
}

/**
 * Sort and filter controls, folded away by default.
 * chips: [{ label, active }] — shown as a quiet summary while closed; active ones count on the badge.
 * Open/closed is remembered per screen (id) on this device.
 */
export function FilterPanel({ id, chips = [], onReset, children, extra }) {
  const { t, prefs, setPrefs } = useApp();
  const open = !!prefs.filtersOpen?.[id];
  const list = chips.filter((c) => c && c.label);
  const active = list.filter((c) => c.active);
  const toggle = () => setPrefs({ filtersOpen: { ...(prefs.filtersOpen || {}), [id]: !open } });
  const bodyId = `fp-${id}`;
  return (
    <div className={`fp ${open ? 'open' : ''}`}>
      <div className="fp-bar">
        <button type="button" className={`fp-toggle ${active.length ? 'has' : ''}`} aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <Icon name="sliders" size={16} />
          <span>{t('flt.title')}</span>
          {active.length > 0 && <span className="fp-count num">{active.length}</span>}
          <Icon name="down" size={15} className="fp-chev" />
        </button>
        <Help k="filters" />
        {!open && list.length > 0 && (
          <div className="fp-chips">
            {list.map((c, i) => <button type="button" key={i} className={`fp-chip ${c.active ? 'on' : ''}`} onClick={toggle}>{c.label}</button>)}
          </div>
        )}
        {active.length > 0 && onReset && <button type="button" className="fp-reset" onClick={onReset}><Icon name="close" size={13} />{t('flt.reset')}</button>}
        {extra && <div className="fp-extra">{extra}</div>}
      </div>
      <div className="fp-body" id={bodyId}>
        <div className="fp-inner" ref={(el) => { if (el) { if (open) el.removeAttribute('inert'); else el.setAttribute('inert', ''); } }}>
          <div className="fp-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * A panel whose body folds away smoothly. Remembers its state per device.
 * `summary` shows in the header while folded, so the key numbers stay visible.
 */
export function Fold({ id, title, summary, extra, children, defaultOpen = true, className = '' }) {
  const { t, prefs, setPrefs } = useApp();
  const saved = prefs.folds?.[id];
  const open = saved === undefined ? defaultOpen : saved;
  const toggle = () => setPrefs({ folds: { ...(prefs.folds || {}), [id]: !open } });
  const bodyId = `fold-${id}`;
  return (
    <section className={`panel fold ${open ? 'open' : 'shut'} ${className}`}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" onClick={toggle} aria-expanded={open} aria-controls={bodyId} title={open ? t('fold.hide') : t('fold.show')}>
          <span className="fold-chev"><Icon name="down" size={16} /></span>
          <h2>{title}</h2>
        </button>
        <div className="fold-summary" aria-hidden={open}>{summary}</div>
        {extra && <div className="fold-extra">{extra}</div>}
        <button type="button" className="fold-pill" onClick={toggle} aria-controls={bodyId}>{open ? t('fold.hide') : t('fold.show')}</button>
      </div>
      <div className="fold-body" id={bodyId}>
        <div className="fold-inner" ref={(el) => { if (el) { if (open) el.removeAttribute('inert'); else el.setAttribute('inert', ''); } }}>
          <div className="fold-content">{children}</div>
        </div>
      </div>
    </section>
  );
}


/* ── View and sort menu (like a file explorer's "View" and "Sort by") ──
   useListView(id, defaults) remembers the choice per list on this device; ViewMenu shows it. */
export function useListView(id, { view = 'list', sort, dir = 'desc' } = {}) {
  const { prefs, setPrefs } = useApp();
  const saved = prefs.views?.[id] || {};
  const cur = { view: saved.view || view, sort: saved.sort || sort, dir: saved.dir || dir };
  const set = (p) => setPrefs({ views: { ...(prefs.views || {}), [id]: { ...cur, ...p } } });
  return { ...cur, set, isDefault: cur.view === view && cur.sort === sort && cur.dir === dir, reset: () => set({ view, sort, dir }) };
}
/** Sort rows by one of the getters, ascending or descending, keeping ties in their original order. */
export function sortRows(rows, getters, sort, dir) {
  const g = getters[sort];
  if (!g) return rows;
  const k = dir === 'asc' ? 1 : -1;
  return rows.map((r, i) => [r, g(r), i]).sort((a, b) => {
    const x = a[1], y = b[1];
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
    return c * k || a[2] - b[2];
  }).map((x) => x[0]);
}
const VIEW_ICON = { tiles: 'grid', list: 'list', compact: 'rows' };
export function ViewMenu({ v, sorts = [], views = ['list', 'compact'] }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const sortLabel = sorts.find((x) => x.value === v.sort)?.label;
  return (
    <div className="vm" ref={ref}>
      <button type="button" className={`vm-btn ${open ? 'on' : ''} ${v.isDefault ? '' : 'has'}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t('vm.title')}>
        <Icon name={VIEW_ICON[v.view] || 'list'} size={15} />
        <span>{sortLabel ? `${sortLabel} ${v.dir === 'asc' ? '↑' : '↓'}` : t('vm.title')}</span>
        <Icon name="down" size={13} />
      </button>
      {open && (
        <div className="vm-pop" role="menu">
          {views.length > 1 && <>
            <div className="vm-h">{t('vm.view')}</div>
            <div className="vm-views">
              {views.map((x) => <button type="button" role="menuitemradio" aria-checked={v.view === x} key={x} className={v.view === x ? 'on' : ''} onClick={() => v.set({ view: x })}><Icon name={VIEW_ICON[x]} size={16} />{t(`vm.v.${x}`)}</button>)}
            </div>
          </>}
          {sorts.length > 0 && <>
            <div className="vm-h">{t('vm.sort')}</div>
            {sorts.map((x) => <button type="button" role="menuitemradio" aria-checked={v.sort === x.value} key={x.value} className={`vm-item ${v.sort === x.value ? 'on' : ''}`} onClick={() => v.set({ sort: x.value, dir: x.dir || v.dir })}><span className="vm-dot" />{x.label}</button>)}
            <div className="vm-h">{t('vm.order')}</div>
            <div className="vm-views two">
              <button type="button" className={v.dir === 'asc' ? 'on' : ''} onClick={() => v.set({ dir: 'asc' })}>↑ {t('vm.asc')}</button>
              <button type="button" className={v.dir === 'desc' ? 'on' : ''} onClick={() => v.set({ dir: 'desc' })}>↓ {t('vm.desc')}</button>
            </div>
          </>}
          {!v.isDefault && <button type="button" className="vm-reset" onClick={() => { v.reset(); setOpen(false); }}>{t('vm.reset')}</button>}
        </div>
      )}
    </div>
  );
}
