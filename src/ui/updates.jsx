import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp, VERSION } from './store.jsx';
import { Button, Icon } from './kit.jsx';
import { releasesSince, cmpVersion, CHANGELOG } from '../changelog.js';

const FROM_KEY = 'mazraati-updated-from';

/** "A new version is ready" card. The service worker announces itself through mz-update-ready. */
export function UpdatePrompt() {
  const { t } = useApp();
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => { setReady(true); setLater(false); };
    window.addEventListener('mz-update-ready', on);
    if (window.__mzUpdateReady) on();
    return () => window.removeEventListener('mz-update-ready', on);
  }, []);
  const update = () => {
    setBusy(true);
    try { localStorage.setItem(FROM_KEY, VERSION.name); } catch { /* optional */ }
    const reg = window.__mzSw;
    let done = false;
    const reload = () => { if (!done) { done = true; location.reload(); } };
    navigator.serviceWorker?.addEventListener('controllerchange', reload);
    if (reg?.waiting) reg.waiting.postMessage('skip');
    setTimeout(reload, 4000);
  };
  if (busy) {
    return createPortal(
      <div className="upd-overlay" role="status" aria-live="polite">
        <div className="upd-installing"><span className="upd-spin" /><b>{t('upd.installing')}</b><span className="muted small">{t('upd.keepOpen')}</span></div>
      </div>, document.body);
  }
  if (!ready || later) return null;
  return (
    <div className="upd-card" role="alertdialog" aria-labelledby="upd-title">
      <span className="upd-ico"><Icon name="download" size={20} /></span>
      <div className="upd-text">
        <b id="upd-title">{t('upd.ready')}</b>
        <span className="muted small">{t('upd.readyHint')}</span>
      </div>
      <div className="upd-btns">
        <Button size="sm" variant="quiet" onClick={() => setLater(true)}>{t('upd.later')}</Button>
        <Button size="sm" variant="primary" onClick={update}>{t('upd.now')}</Button>
      </div>
    </div>
  );
}

/** Celebration after an update: what changed since the version this device last saw. */
export function WhatsNew({ since, all, onClose }) {
  const { t, lang } = useApp();
  const releases = useMemo(() => (all ? CHANGELOG : releasesSince(since, VERSION.name)).filter((r) => r.items.length), [since, all]);
  const shown = all ? releases : releases.slice(0, 4);
  const L = lang === 'ar' ? 1 : 2;
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    setTimeout(() => document.querySelector('.wn-foot .btn')?.focus({ preventScroll: true }), 50);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  let n = 0;
  return createPortal(
    <div className="scrim wn-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`wn-card ${all ? 'history' : ''}`} role="dialog" aria-modal="true" aria-labelledby="wn-title">
        {!all && (
          <div className="wn-hero">
            <div className="wn-burst" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ '--i': i }} />)}</div>
            <svg className="wn-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
          </div>
        )}
        <h2 id="wn-title">{all ? t('upd.history') : t('upd.done')}</h2>
        <div className="wn-ver">
          <span className="wn-pill num">{t('set.version', { v: VERSION.name })}</span>
          <span className="muted small">{VERSION.season[lang]}</span>
        </div>
        {!all && <p className="muted wn-lead">{since ? t('upd.lead', { v: since }) : t('upd.leadFresh')}</p>}
        <div className="wn-list">
          {shown.map((r) => (
            <section key={r.v} className="wn-rel">
              {(shown.length > 1 || all) && <div className="wn-rel-head"><b className="num">{r.v}</b>{r.date && <span className="muted small num">{new Date(`${r.date}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}</div>}
              <ul>
                {r.items.map((it) => (
                  <li key={it[2]} style={{ '--d': `${Math.min(n++, 14) * 55 + 250}ms` }}>
                    <span className="wn-ico"><Icon name={it[0]} size={16} /></span><span>{it[L]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!all && releases.length > shown.length && <p className="muted small">{t('upd.andMore', { n: releases.length - shown.length })}</p>}
        </div>
        <div className="wn-foot">
          <Button variant="primary" onClick={onClose}>{all ? t('close') : t('upd.start')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Decides when to celebrate: once per device per version, never on a brand-new farm. */
export function WhatsNewGate() {
  const { prefs, setPrefs, rawFarm } = useApp();
  const [open, setOpen] = useState(null); // { since }
  useEffect(() => {
    const seen = prefs.seenVersion;
    if (seen && cmpVersion(VERSION.name, seen) <= 0) return;
    let from = seen;
    try { from = from || localStorage.getItem(FROM_KEY) || ''; } catch { /* optional */ }
    const old = (rawFarm.records?.length || 0) + (rawFarm.customers?.length || 0) > 0 && Date.now() - new Date(rawFarm.createdAt || Date.now()).getTime() > 3600000;
    if (!seen && !from && !old) { setPrefs({ seenVersion: VERSION.name }); return; }
    const id = setTimeout(() => setOpen({ since: from || CHANGELOG[1]?.v || '' }), 600);
    return () => clearTimeout(id); // eslint-disable-line consistent-return
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return <WhatsNew since={open.since} onClose={() => { setOpen(null); setPrefs({ seenVersion: VERSION.name }); try { localStorage.removeItem(FROM_KEY); } catch { /* optional */ } }} />;
}
