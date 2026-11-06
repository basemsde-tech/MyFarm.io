// Refresh the app: look for a new version, clear the app's stored files (cache) and reload fresh.
// Farm data is never touched: it lives in the device store (IndexedDB / localStorage), not in the cache.
import { DancingCow } from './celebrate.jsx';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp, VERSION } from './store.jsx';
import { Button, Icon, IconButton } from './kit.jsx';

const OWN = 'mazraati3-'; // only this app's caches; Mazraati 2 on the same site keeps its own
const DONE_KEY = 'mazraati-refreshed';
const FROM_KEY = 'mazraati-updated-from';

/** How many files the app keeps in its cache, and roughly how big they are. */
export async function cacheInfo() {
  if (typeof caches === 'undefined') return { files: 0, bytes: 0 };
  let files = 0; let bytes = 0;
  for (const k of (await caches.keys()).filter((x) => x.startsWith(OWN))) {
    const c = await caches.open(k);
    for (const req of await c.keys()) {
      files += 1;
      try { const r = await c.match(req); bytes += Number(r?.headers.get('content-length')) || (await r.clone().blob()).size; } catch { /* skip */ }
    }
  }
  return { files, bytes };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The refresh itself. Steps: save everything → make sure the site can be reached (never empty the
 * cache while offline, or the app could not open) → look for a new version → clear the cache → reload.
 */
export async function refreshApp({ whenSaved, step = () => {} }) {
  step('save');
  await whenSaved?.();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const r = await fetch(`./index.html?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return { ok: false, reason: 'offline' };
  } catch { return { ok: false, reason: 'offline' }; }

  step('check');
  let reg = window.__mzSw;
  try { reg = reg || (await navigator.serviceWorker?.getRegistration()); } catch { /* none */ }
  if (reg) {
    try { await reg.update(); } catch { /* keep going */ }
    // A new version may still be downloading: give it a moment.
    for (let i = 0; i < 30 && reg.installing; i++) await wait(200);
  }
  const updating = !!reg?.waiting;

  step('clear');
  if (typeof caches !== 'undefined') {
    const keys = (await caches.keys()).filter((k) => k.startsWith(OWN));
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  // Download the app's files again straight away, so it still opens and makes PDFs offline.
  const sw = reg?.waiting || reg?.active;
  if (sw && typeof MessageChannel === 'function') {
    await new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => res();
      try { sw.postMessage('recache', [ch.port2]); } catch { res(); }
      setTimeout(res, 10000);
    });
  }

  step('reload');
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify({ from: VERSION.name, at: Date.now() }));
    if (updating) localStorage.setItem(FROM_KEY, VERSION.name);
  } catch { /* optional */ }
  if (updating) {
    await new Promise((res) => {
      let done = false;
      const go = () => { if (!done) { done = true; res(); } };
      navigator.serviceWorker.addEventListener('controllerchange', go);
      reg.waiting.postMessage('skip');
      setTimeout(go, 4000);
    });
  }
  location.reload();
  return { ok: true, updating };
}

/** Full-screen progress while refreshing. */
function RefreshOverlay({ stage }) {
  const { t, prefs } = useApp();
  const steps = ['save', 'check', 'clear', 'reload'];
  const at = steps.indexOf(stage);
  return createPortal(
    <div className="upd-overlay" role="status" aria-live="polite">
      <div className="upd-installing rf-card">
        {prefs.playful !== false ? <DancingCow /> : <span className="upd-spin" />}
        <b>{t('rf.working')}</b>
        <ol className="rf-steps">
          {steps.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''}><Icon name={i < at ? 'check' : 'more'} size={13} />{t(`rf.s.${s}`)}</li>)}
        </ol>
        <span className="muted small">{t('rf.safe')}</span>
      </div>
    </div>, document.body);
}

/** Runs a refresh with its overlay; reports problems as a toast. */
export function useRefresh() {
  const { whenSaved, toast, t } = useApp();
  const [stage, setStage] = useState(null);
  const run = async () => {
    if (stage) return;
    setStage('save');
    try {
      const res = await refreshApp({ whenSaved, step: setStage });
      if (!res.ok) { setStage(null); toast(t(res.reason === 'offline' ? 'rf.offline' : 'rf.failed'), { tone: 'bad', ms: 6000 }); }
    } catch {
      setStage(null); toast(t('rf.failed'), { tone: 'bad' });
    }
  };
  return { run, busy: !!stage, overlay: stage ? <RefreshOverlay stage={stage} /> : null };
}

/** Top-bar button. */
export function RefreshButton() {
  const { t } = useApp();
  const r = useRefresh();
  return <><span className="rf-top"><IconButton icon="refresh" label={t('rf.title')} onClick={r.run} disabled={r.busy} /></span>{r.overlay}</>;
}

/** Settings → About: what refreshing does, how much is cached, and the button. */
export function RefreshPanel() {
  const { t } = useApp();
  const r = useRefresh();
  const [info, setInfo] = useState(null);
  useEffect(() => { cacheInfo().then(setInfo).catch(() => {}); }, []);
  const size = info?.bytes ? (info.bytes > 1048576 ? `${(info.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(info.bytes / 1024))} KB`) : null;
  return (
    <div className="rf-panel">
      <div>
        <b>{t('rf.title')}</b>
        <p className="muted small">{t('rf.hint')}{info ? ` ${t('rf.cached', { n: info.files, s: size || '0 KB' })}` : ''}</p>
      </div>
      <Button icon="refresh" onClick={r.run} disabled={r.busy}>{t('rf.button')}</Button>
      {r.overlay}
    </div>
  );
}

/** After the reload: a short confirmation (What's new takes over when the version changed). */
export function RefreshedToast() {
  const { toast, t } = useApp();
  useEffect(() => {
    let v = null;
    try { v = JSON.parse(sessionStorage.getItem(DONE_KEY) || 'null'); sessionStorage.removeItem(DONE_KEY); } catch { /* optional */ }
    if (!v || Date.now() - v.at > 60000) return;
    if (v.from !== VERSION.name) return; // updated: What's new shows instead
    setTimeout(() => toast(t('rf.done', { v: VERSION.name }), { tone: 'good' }), 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
