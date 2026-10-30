import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './store.jsx';
import { Button, Icon, Check, Empty } from './kit.jsx';
import { TEXT, TOURS } from '../guide-content.js';

const fill = (s, v = {}) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);
export function useGuide() {
  const { lang } = useApp();
  return TEXT[lang] || TEXT.en;
}

/** Place a floating box next to an anchor rect, inside the viewport. */
function place(rect, box, gap = 10) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(box.w, vw - 24);
  let left = rect.left + rect.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, vw - w - 12));
  const below = rect.bottom + gap + box.h <= vh - 8 || rect.top < box.h + gap + 8;
  const top = below ? Math.min(rect.bottom + gap, vh - box.h - 8) : rect.top - gap - box.h;
  const arrow = Math.max(16, Math.min(w - 16, rect.left + rect.width / 2 - left));
  return { left, top: Math.max(8, top), w, below, arrow };
}

/** A small cloud that explains one feature. */
function Bubble({ anchor, title, body, onClose, more }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const { t, nav } = useApp();
  const g = useGuide();
  const update = useCallback(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    setPos(place(r, { w: 300, h: ref.current.offsetHeight || 120 }));
  }, [anchor]);
  useLayoutEffect(() => { update(); }, [update]);
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    document.addEventListener('pointerdown', out); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', key); };
  }, [update, onClose, anchor]);
  return createPortal(
    <div ref={ref} className={`help-bubble ${pos?.below === false ? 'above' : 'below'}`} role="dialog" aria-label={title}
      style={pos ? { left: pos.left, top: pos.top, inlineSize: pos.w, '--arrow': `${pos.arrow}px` } : { visibility: 'hidden', left: 0, top: 0 }}>
      <button type="button" className="hb-close" onClick={onClose} aria-label={t('close')}><Icon name="close" size={14} /></button>
      {title && <b className="hb-title">{title}</b>}
      <p>{body}</p>
      {more && <button type="button" className="link small" onClick={() => { onClose(); nav('guide', more); }}>{g.ui.more}</button>}
    </div>,
    document.body,
  );
}

/**
 * The "?" mark. Shown only in help mode (or always=true). k: key in the help texts.
 * more: guide section to link to.
 */
export function Help({ k, always, more, label }) {
  const { prefs } = useApp();
  const g = useGuide();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!prefs.helpMode && !always) return null;
  const body = g.help[k];
  if (!body) return null;
  return (
    <>
      <button type="button" ref={ref} className={`help-dot ${open ? 'on' : ''}`} aria-label={label || g.ui.helpMode} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(!open); }}>?</button>
      {open && <Bubble anchor={ref.current} body={body} onClose={() => setOpen(false)} more={more} />}
    </>
  );
}

/** Top-bar "?" button: help mode toggle, this page's tour, the guide. */
export function HelpMenu() {
  const { prefs, setPrefs, nav, route } = useApp();
  const g = useGuide();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);
  const hasTour = !!TOURS[route.name];
  return (
    <div className="help-menu" ref={ref}>
      <button type="button" className={`help-toggle ${prefs.helpMode ? 'on' : ''}`} aria-label={g.ui.helpMode} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="help" size={19} /></button>
      {open && (
        <div className="acct-pop help-pop" role="menu">
          <label className="hp-switch">
            <span><b>{g.ui.helpMode}</b><small className="muted">{g.help.filters ? '' : ''}</small></span>
            <input type="checkbox" role="switch" checked={!!prefs.helpMode} onChange={(e) => setPrefs({ helpMode: e.target.checked })} />
          </label>
          {hasTour && <button type="button" role="menuitem" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('mz-tour', { detail: route.name })); }}><Icon name="sliders" size={17} />{g.ui.tourThis}</button>}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); nav('guide'); }}><Icon name="help" size={17} />{g.ui.guide}</button>
        </div>
      )}
    </div>
  );
}

export function HelpModeBanner() {
  const { prefs, setPrefs, t } = useApp();
  const g = useGuide();
  if (!prefs.helpMode) return null;
  return <div className="banner info help-banner"><Icon name="help" size={16} /><span>{g.ui.helpOn}</span><button type="button" onClick={() => setPrefs({ helpMode: false })}>{t('close')}</button></div>;
}

/* ───────────── Guided tours ───────────── */
function findEl(sel) {
  for (const s of sel.split(',')) {
    for (const el of document.querySelectorAll(s.trim())) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
}

export function TourHost() {
  const { route, prefs, setPrefs, stack } = useApp();
  const g = useGuide();
  const [tour, setTour] = useState(null); // { name, steps, i }
  const [rect, setRect] = useState(null);
  const box = useRef(null);
  const start = useCallback((name) => {
    const defs = TOURS[name] || [];
    const steps = defs.map((d) => ({ ...d, el: findEl(d.sel) })).filter((d) => d.el && g.tour[name]?.[d.id]);
    if (steps.length) setTour({ name, steps, i: 0 });
  }, [g]);
  const finish = useCallback(() => {
    if (tour) setPrefs({ toursDone: { ...(prefs.toursDone || {}), [tour.name]: true } });
    setTour(null); setRect(null);
  }, [tour, prefs.toursDone, setPrefs]);
  // First visit to a page with a tour, while tutorials are on.
  useEffect(() => {
    if (prefs.tutorials === false || prefs.toursDone?.[route.name] || !TOURS[route.name] || route.id) return undefined;
    const id = setTimeout(() => { if (!document.querySelector('.scrim')) start(route.name); }, 900);
    return () => clearTimeout(id);
  }, [route.name, route.id, prefs.tutorials, prefs.toursDone, start]);
  useEffect(() => {
    const fn = (e) => start(e.detail);
    window.addEventListener('mz-tour', fn);
    return () => window.removeEventListener('mz-tour', fn);
  }, [start]);
  useEffect(() => { if (tour && stack.length) { setTour(null); setRect(null); } }, [stack.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page ends its tour (without marking it done).
  useEffect(() => { setTour((tr) => (tr && tr.name !== route.name ? null : tr)); }, [route.name, route.id]);
  const step = tour?.steps[tour.i];
  const measure = useCallback(() => {
    if (!step) return;
    const el = step.el.isConnected ? step.el : findEl(step.sel);
    if (!el) return;
    setRect(el.getBoundingClientRect());
  }, [step]);
  useLayoutEffect(() => {
    if (!step) return undefined;
    const r0 = step.el.getBoundingClientRect();
    const tall = r0.height > window.innerHeight * 0.55;
    if (r0.top < 70 || r0.bottom > window.innerHeight - (tall ? 0 : 200)) step.el.scrollIntoView?.({ block: tall ? 'start' : 'center', behavior: 'smooth' });
    const id = setTimeout(measure, 320);
    measure();
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    const key = (e) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const fwd = (e.key === 'ArrowLeft') === (document.dir === 'rtl'); go(fwd ? 1 : -1); } };
    window.addEventListener('keydown', key);
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.removeEventListener('keydown', key); };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (d) => setTour((tr) => {
    if (!tr) return tr;
    const i = tr.i + d;
    if (i >= tr.steps.length) { setTimeout(finish); return tr; }
    return { ...tr, i: Math.max(0, i) };
  });
  if (!tour || !step || !rect) return null;
  const txt = g.tour[tour.name][step.id];
  const pad = 6;
  const vh = window.innerHeight;
  // Tall areas: clip the spotlight to the screen and dock the card at the bottom.
  const top = Math.max(rect.top, 4), bottom = Math.min(rect.bottom, vh - 4);
  const hole = { left: rect.left - pad, top: top - pad, width: rect.width + pad * 2, height: Math.max(20, bottom - top) + pad * 2 };
  const mobile = window.innerWidth < 640 || bottom - top > vh * 0.55;
  const pos = mobile ? null : place(rect, { w: 320, h: box.current?.offsetHeight || 170 }, 14);
  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={txt.t}>
      <div className="tour-hole" style={hole} />
      <div ref={box} className={`tour-box ${mobile ? 'tb-sheet' : pos.below ? 'below' : 'above'}`} style={mobile ? { top: 'auto', bottom: 12, left: 12, right: 12 } : { left: pos.left, top: pos.top, bottom: 'auto', right: 'auto', inlineSize: pos.w, '--arrow': `${pos.arrow}px` }}>
        <div className="tb-count num">{fill(g.ui.of, { a: tour.i + 1, b: tour.steps.length })}</div>
        <b className="tb-title">{txt.t}</b>
        <p>{txt.b}</p>
        <div className="tb-dots">{tour.steps.map((s, i) => <span key={s.id} className={i === tour.i ? 'on' : ''} />)}</div>
        <div className="tb-foot">
          <button type="button" className="link small" onClick={finish}>{g.ui.skip}</button>
          <span className="spacer" />
          {tour.i > 0 && <Button size="sm" onClick={() => go(-1)}>{g.ui.back}</Button>}
          <Button size="sm" variant="primary" onClick={() => go(1)}>{tour.i === tour.steps.length - 1 ? g.ui.done : g.ui.next}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────── The guide ───────────── */
export function GuideScreen() {
  const { route, nav } = useApp();
  const g = useGuide();
  const [q, setQ] = useState('');
  const refs = useRef({});
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return g.sections;
    return g.sections.filter((x) => [x.title, x.intro, ...x.steps, ...x.tips].join(' ').toLowerCase().includes(s));
  }, [q, g]);
  useEffect(() => {
    if (route.id && refs.current[route.id]) setTimeout(() => refs.current[route.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [route.id]);
  const tour = (sec) => { nav(sec.route, null, sec.tab || null); setTimeout(() => window.dispatchEvent(new CustomEvent('mz-tour', { detail: sec.route })), 900); };
  return (
    <div className="screen guide">
      <header className="page-head"><div className="page-title"><div><h1>{g.ui.guide}</h1><div className="page-sub">{g.ui.guideSub}</div></div></div></header>
      <div className="guide-layout">
        <aside className="guide-toc">
          <input className="input search" placeholder={g.ui.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={g.ui.search} />
          <nav aria-label={g.ui.contents}>
            {list.map((s) => (
              <button type="button" key={s.id} className={route.id === s.id ? 'on' : ''} onClick={() => { nav('guide', s.id); refs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                <Icon name={s.icon} size={16} /><span>{s.title}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="guide-body">
          {list.length ? list.map((s) => (
            <section key={s.id} className={`panel guide-sec ${route.id === s.id ? 'focus' : ''}`} ref={(el) => { refs.current[s.id] = el; }} id={`guide-${s.id}`}>
              <div className="gs-head">
                <span className="gs-ico"><Icon name={s.icon} size={20} /></span>
                <div><h2>{s.title}</h2><p className="muted">{s.intro}</p></div>
              </div>
              <ol className="gs-steps">{s.steps.map((x, i) => <li key={i}><span className="num">{i + 1}</span><p>{x}</p></li>)}</ol>
              {s.tips.length > 0 && <div className="gs-tips">{s.tips.map((x, i) => <p key={i}><Icon name="alert" size={14} />{x}</p>)}</div>}
              <div className="row-btns">
                <Button size="sm" icon="popout" onClick={() => nav(s.route, null, s.tab || null)}>{g.ui.open}</Button>
                {TOURS[s.route] && <Button size="sm" variant="quiet" icon="sliders" onClick={() => tour(s)}>{g.ui.tour}</Button>}
              </div>
            </section>
          )) : <Empty title={g.ui.none} icon="search" />}
        </div>
      </div>
    </div>
  );
}

/** Settings → Help & tutorials. */
export function HelpPanel() {
  const { prefs, setPrefs, nav, t, toast } = useApp();
  const g = useGuide();
  return (
    <section className="panel help-panel">
      <h2>{t('hlp.title')}</h2>
      <div className="help-toggles">
        <Check label={t('hlp.tutorials')} hint={t('hlp.tutorialsHint')} checked={prefs.tutorials !== false} onChange={(v) => setPrefs({ tutorials: v })} />
        <Check label={t('hlp.helpMode')} hint={t('hlp.helpModeHint')} checked={!!prefs.helpMode} onChange={(v) => setPrefs({ helpMode: v })} />
      </div>
      <div className="row-btns">
        <Button size="sm" icon="help" onClick={() => nav('guide')}>{g.ui.guide}</Button>
        <Button size="sm" icon="undo" onClick={() => { setPrefs({ toursDone: {}, tutorials: true }); toast(t('hlp.restarted')); }}>{t('hlp.restart')}</Button>
      </div>
    </section>
  );
}
