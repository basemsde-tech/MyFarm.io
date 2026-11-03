// Pick lines in any list and see their total, like the status bar in a spreadsheet.
// A <SelectScope> wraps a list; rows inside it (RecordRow, or anything using <SelTick>/<SelBox>)
// become selectable. The bar at the bottom shows the count, the total and a breakdown.
import { createPortal } from 'react-dom';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './store.jsx';
import { Icon } from './kit.jsx';
import { can } from '../core/catalog.mjs';
import { milkQ } from './units.js';
import { fmtQty } from '../core/money.mjs';
import { measureOf, summarise } from '../core/selection.mjs';

export { measureOf };

const SelCtx = createContext(null);
export const useSel = () => useContext(SelCtx);

const touchLike = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
const sig = (i) => `${i.amountC}|${i.qty}|${i.sign}|${i.skip}|${i.label}|${JSON.stringify(i.extras || null)}`;
let scopeSeq = 0;

/**
 * Wraps a list. `actions(items, clear)` adds buttons to the bar (e.g. Restore in Recently deleted);
 * `deletable` shows the bar's Delete for record lines.
 */
export function SelectScope({ children, actions, deletable = true }) {
  const [sel, setSel] = useState(() => new Map());
  const reg = useRef(new Map());
  const box = useRef(null);
  const last = useRef(null);
  const token = useRef(++scopeSeq);
  const clear = useCallback(() => { setSel((m) => (m.size ? new Map() : m)); last.current = null; }, []);
  // Only one list selects at a time: starting here clears any other list on the page.
  useEffect(() => {
    const on = (e) => { if (e.detail !== token.current) clear(); };
    window.addEventListener('mz-sel', on);
    return () => window.removeEventListener('mz-sel', on);
  }, [clear]);
  useEffect(() => {
    if (!sel.size) return undefined;
    const key = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.sheet, .modal, [role="dialog"]')) return; // a form is open: Esc is for it
      clear();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sel.size, clear]);
  const order = () => [...(box.current?.querySelectorAll('[data-selk]') || [])].map((el) => el.getAttribute('data-selk'));
  const announce = (m) => { if (m.size) window.dispatchEvent(new CustomEvent('mz-sel', { detail: token.current })); };
  const api = useMemo(() => ({
    sel,
    active: sel.size > 0,
    has: (k) => sel.has(k),
    register: (item) => { reg.current.set(item.key, item); },
    unregister: (k) => { reg.current.delete(k); setSel((m) => { if (!m.has(k)) return m; const n = new Map(m); n.delete(k); return n; }); },
    refresh: (item) => setSel((m) => { const o = m.get(item.key); if (!o || sig(o) === sig(item)) return m; const n = new Map(m); n.set(item.key, item); return n; }),
    /** Click on a tick. Shift-click picks every line between the last one and this one. */
    toggle: (item, e) => {
      setSel((m) => {
        const n = new Map(m);
        const on = !m.has(item.key);
        if (e?.shiftKey && last.current && last.current !== item.key) {
          const keys = order();
          const a = keys.indexOf(last.current); const b = keys.indexOf(item.key);
          if (a >= 0 && b >= 0) {
            for (const k of keys.slice(Math.min(a, b), Math.max(a, b) + 1)) {
              const it = reg.current.get(k);
              if (it) { if (on) n.set(k, it); else n.delete(k); }
            }
            announce(n);
            return n;
          }
        }
        if (on) n.set(item.key, item); else n.delete(item.key);
        announce(n);
        return n;
      });
      last.current = item.key;
    },
    /** Tick or untick a set of lines at once (a whole day or month, or the table header). */
    setMany: (keys, on) => setSel((m) => {
      const n = new Map(m);
      for (const k of keys) { const it = reg.current.get(k); if (!it) continue; if (on) n.set(k, it); else n.delete(k); }
      announce(n);
      return n;
    }),
    selectAll: () => setSel(() => { const n = new Map(); for (const k of order()) { const it = reg.current.get(k); if (it) n.set(k, it); } announce(n); return n; }),
    shownCount: () => order().length,
    clear,
  }), [sel, clear]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SelCtx.Provider value={api}>
      <div ref={box} className={`sel-scope ${sel.size ? 'sel-on' : ''}`}>{children}</div>
      <SelBar actions={actions} deletable={deletable} />
    </SelCtx.Provider>
  );
}

/** Lets a row take part in the selection. Returns null outside a scope. */
export function useSelectable(item) {
  const s = useSel();
  const key = item?.key;
  const ref = useRef(item);
  ref.current = item;
  useEffect(() => {
    if (!s || key == null) return undefined;
    s.register(ref.current);
    return () => s.unregister(key);
  }, [key, !!s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s || key == null) return;
    s.register(item);
    if (s.has(key)) s.refresh(item);
  });
  if (!s || key == null) return null;
  return { on: s.has(key), toggle: (e) => s.toggle(ref.current, e), active: s.active };
}

/** The tick over a row's icon: tap the icon to pick the line. */
export function TickButton({ st, k }) {
  const { t } = useApp();
  return (
    <button type="button" className={`row-sel ${st.on ? 'on' : ''}`} data-selk={k} aria-pressed={st.on} aria-label={t('sel.pick')} title={t('sel.pickHint')}
      onClick={(e) => { e.stopPropagation(); st.toggle(e); }}>
      <span className="row-sel-box"><Icon name="check" size={14} /></span>
    </button>
  );
}
export function SelTick({ item }) {
  const st = useSelectable(item);
  return st ? <TickButton st={st} k={item.key} /> : null;
}

/** A checkbox for table rows. */
export function SelBox({ item }) {
  const { t } = useApp();
  const st = useSelectable(item);
  if (!st) return null;
  return <input type="checkbox" className="sel-box" data-selk={item.key} checked={st.on} aria-label={t('sel.pick')} onClick={(e) => { e.stopPropagation(); st.toggle(e); }} onChange={() => {}} />;
}

/** Tick for a whole group (a day, a month, the table): ticks every line inside `getEl()`. */
export function SelGroup({ getEl, label }) {
  const s = useSel();
  const { t } = useApp();
  if (!s) return null;
  const keys = () => [...(getEl()?.querySelectorAll('[data-selk]') || [])].map((el) => el.getAttribute('data-selk'));
  const ks = keys();
  const n = ks.filter((k) => s.has(k)).length;
  const all = ks.length > 0 && n === ks.length;
  return (
    <button type="button" className={`grp-sel ${all ? 'on' : n ? 'some' : ''}`} aria-pressed={all} aria-label={`${t('sel.pickAll')}${label ? ` · ${label}` : ''}`} title={t('sel.pickAll')}
      onClick={(e) => { e.stopPropagation(); s.setMany(keys(), !all); }}>
      <span className="row-sel-box"><Icon name={n && !all ? 'minus' : 'check'} size={13} /></span>
    </button>
  );
}

/** Long press (phones) picks a line; once picking, a tap picks more instead of opening. */
export function useRowPress(st, open) {
  const timer = useRef(null);
  const fired = useRef(false);
  if (!st) return { onClick: open };
  const cancel = () => { clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => { fired.current = true; st.toggle(); try { navigator.vibrate?.(12); } catch { /* optional */ } }, 480);
    },
    onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel,
    onContextMenu: (e) => { if (fired.current || timer.current) e.preventDefault(); },
    onClick: (e) => {
      if (fired.current) { fired.current = false; e.preventDefault(); return; }
      if (st.active && touchLike()) { st.toggle(e); return; }
      open(e);
    },
  };
}

/* ───────────── the bar ───────────── */

function SelBar({ actions, deletable }) {
  const s = useSel();
  const { t, fmt, ui, actor, toast } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!s.active) setOpen(false); }, [s.active]);
  // Leaves room under the page so the last lines can scroll above the bar.
  useEffect(() => {
    if (!s.active) return undefined;
    document.body.classList.add('has-selbar');
    return () => document.body.classList.remove('has-selbar');
  }, [s.active]);
  if (!s.active) return null;
  const items = [...s.sel.values()];
  const sum = summarise(items);
  const showQ = (q, unit) => (unit === 'L' ? milkQ(q) : `${fmtQty(q, 0)} ${t('u.egg')}`);
  const showG = (g) => (g.hasAmt ? fmt(g.amountC) : g.unit ? showQ(g.qty, g.unit) : '');
  const showV = (v) => (sum.head?.kind === 'qty' ? showQ(v, sum.head.unit) : fmt(Math.round(v)));
  const headText = !sum.head ? null : sum.head.kind === 'qty' ? showQ(sum.head.value, sum.head.unit)
    : `${sum.head.plus && sum.head.value > 0 ? '+' : ''}${fmt(sum.head.value)}`;
  const ids = [...new Set(items.map((i) => i.recId).filter(Boolean))];
  const shown = s.shownCount();
  const copy = async () => {
    const lines = [t('ed.selected', { n: sum.n })];
    if (headText) lines.push(`${t(`sel.${sum.head.label}`)}: ${headText}`);
    if (sum.types.length > 1 || sum.labels.length > 1) for (const g of sum.labels) lines.push(`${g.name} (${g.n}): ${showG(g)}`);
    for (const e of sum.extras) lines.push(`${e.label}: ${fmt(e.c)}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(t('copied'), { tone: 'good' }); } catch { toast(lines.join(' · ')); }
  };
  return createPortal(
    <div className={`sel-bar sb2 ${open ? 'open' : ''}`} role="region" aria-label={t('sel.bar')} dir={document.documentElement.dir}>
      {open && (
        <div className="sb-details">
          {(sum.labels.length > 1 || sum.types.length > 1) && <ul className="sb-list">{sum.labels.map((g) => <li key={g.name}><span>{g.name} <span className="muted">×{g.n}</span></span><b className="num">{showG(g)}</b></li>)}</ul>}
          {sum.signed && sum.inC > 0 && sum.outC > 0 && <ul className="sb-list"><li><span>{t('in')}</span><b className="num in">+{fmt(sum.inC)}</b></li><li><span>{t('out')}</span><b className="num out">−{fmt(sum.outC).replace('−', '')}</b></li></ul>}
          {sum.extras.length > 0 && <ul className="sb-list">{sum.extras.map((e) => <li key={e.label}><span>{e.label}</span><b className="num">{fmt(e.c)}</b></li>)}</ul>}
          {sum.stats && <ul className="sb-list sb-stats"><li><span>{t('sel.avg')}</span><b className="num">{showV(sum.stats.avg)}</b></li><li><span>{t('sel.max')}</span><b className="num">{showV(sum.stats.max)}</b></li><li><span>{t('sel.min')}</span><b className="num">{showV(sum.stats.min)}</b></li></ul>}
          {sum.skipped > 0 && <p className="sb-note">{t('sel.skipped', { n: sum.skipped })}</p>}
          {!sum.head && sum.types.length <= 1 && !sum.extras.length && <p className="sb-note">{t('sel.noAmount')}</p>}
        </div>
      )}
      <div className="sb-main">
        <button type="button" className="sb-x" onClick={s.clear} aria-label={t('sel.clear')} title={`${t('sel.clear')} (Esc)`}><Icon name="close" size={16} /></button>
        <button type="button" className="sb-sum" onClick={() => setOpen(!open)} aria-expanded={open} title={t('sel.details')}>
          <span className="sb-n">{t('ed.selected', { n: sum.n })}</span>
          {headText ? <span className="sb-total"><small>{t(`sel.${sum.head.label}`)}</small><b className="num">{headText}</b></span>
            : sum.types.length > 1 ? <span className="sb-chips">{sum.types.slice(0, 3).map((g) => <span key={g.name}><small>{g.name}</small> <b className="num">{showG(g)}</b></span>)}</span> : null}
          <Icon name={open ? 'down' : 'up'} size={14} className="sb-caret" />
        </button>
        <span className="sb-acts">
          {shown > sum.n && <button type="button" className="sb-btn" onClick={s.selectAll} title={t('sel.allN', { n: shown })}><Icon name="list" size={16} /><span>{t('sel.allN', { n: shown })}</span></button>}
          <button type="button" className="sb-btn" onClick={copy} title={t('sel.copy')}><Icon name="file" size={16} /><span>{t('copy')}</span></button>
          {actions?.(items, s.clear)}
          {deletable && ids.length > 0 && can(actor?.role, 'money.delete') && <button type="button" className="sb-btn danger" onClick={() => ui.open('delete', { ids, onDone: s.clear })} title={t('delete')}><Icon name="trash" size={16} /><span>{t('delete')}</span></button>}
        </span>
      </div>
    </div>, document.body);
}
