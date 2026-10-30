// Notifications: one bell for what needs attention and what others did.
// Alerts are worked out from the farm (never stored), so they disappear on their own once
// handled. Read, dismissed and already-pushed state is kept per farm and profile on this device.
// Desktop/phone notifications use the browser's notification system through the service worker:
// they appear while the app is open, minimised or in a background tab.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, readJSON } from './store.jsx';
import { Icon, Avatar, Button, Check } from './kit.jsx';
import { useAttention } from './screens-money.jsx';
import { useBackup, KIND_ICON, SEC } from './admin.jsx';
import { activityLog } from '../core/audit.mjs';
import { reproTimeline, daysBetween } from '../core/species.mjs';
import { can } from '../core/catalog.mjs';

const STORE = 'mazraati-notify-v1';
const DAY = 86400000;
const readAll = () => readJSON(STORE, {});
const writeAll = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* full or blocked */ } };

/** Per farm + profile: { seenAt, read: {key: at}, hidden: {key: until}, pushed: {key: at}, push: bool, urgentOnly: bool } */
function useNoteState(farmId, profileId) {
  const id = `${farmId || 'farm'}:${profileId || 'none'}`;
  const [st, setSt] = useState(() => readAll()[id] || {});
  useEffect(() => {
    // First time on this device: start the activity clock now, so a long history isn't all "new".
    const cur = readAll()[id];
    if (cur?.seenAt) { setSt(cur); return; }
    const next = { ...(cur || {}), seenAt: new Date().toISOString() };
    const all = readAll(); all[id] = next; writeAll(all); setSt(next);
  }, [id]);
  const update = (fn) => setSt((cur) => {
    const next = fn(cur);
    // Forget keys older than 60 days so the store stays small.
    const cut = Date.now() - 60 * DAY;
    for (const k of ['read', 'pushed']) if (next[k]) next[k] = Object.fromEntries(Object.entries(next[k]).filter(([, at]) => at > cut));
    if (next.hidden) next.hidden = Object.fromEntries(Object.entries(next.hidden).filter(([, until]) => until > Date.now()));
    const all = readAll(); all[id] = next; writeAll(all);
    return next;
  });
  return [st, update];
}

/** Everything the bell knows: alerts (needs attention) and activity by others. */
export function useNotifications() {
  const app = useApp();
  const { farm, today, t, actor, lang, names, farmId } = app;
  const attention = useAttention();
  const bk = useBackup();
  const [updateReady, setUpdateReady] = useState(typeof window !== 'undefined' && !!window.__mzUpdateReady);
  useEffect(() => {
    const on = () => setUpdateReady(true);
    window.addEventListener('mz-update-ready', on);
    return () => window.removeEventListener('mz-update-ready', on);
  }, []);
  const [st, update] = useNoteState(farmId, actor?.id);

  const alerts = useMemo(() => {
    const out = attention.map((a) => ({ ...a, key: a.key || a.text }));
    // Herd: births and pregnancy checks coming up.
    for (const a of farm.animals || []) {
      if (a.deletedAt || ['sold', 'dead'].includes(a.status) || !a.repro?.serviceDay) continue;
      const tl = reproTimeline(a.species, a.repro.serviceDay, today, a.repro.check);
      if (!tl || tl.failed) continue;
      const label = a.name ? `${a.tag} · ${a.name}` : a.tag;
      const birth = tl.steps.find((s) => s.key === 'birth');
      const dBirth = daysBetween(today, birth.from || birth.day);
      if (a.repro.check === 'pregnant' && dBirth <= 7) {
        out.push({ key: `birth:${a.id}:${birth.day}`, icon: 'cow', tone: dBirth <= 0 ? 'bad' : 'warn', text: dBirth <= 0 ? t('nt.birthNow', { a: label }) : t('nt.birthSoon', { a: label, n: dBirth }), go: ['animals', a.id] });
      }
      const chk = tl.steps.find((s) => s.key === 'pregCheck');
      if (!a.repro.check && chk && today >= chk.day) out.push({ key: `check:${a.id}:${chk.day}`, icon: 'cow', tone: 'info', text: t('nt.checkDue', { a: label }), go: ['animals', a.id], action: { kind: 'animalEvent', props: { animalId: a.id, kind: 'check' } } });
      const dry = tl.steps.find((s) => s.key === 'dryOff');
      if (a.repro.check === 'pregnant' && a.status !== 'dry' && dry && today >= dry.day && today < birth.day) out.push({ key: `dry:${a.id}:${dry.day}`, icon: 'cow', tone: 'info', text: t('nt.dryDue', { a: label }), go: ['animals', a.id] });
    }
    if (bk?.due && !app.demo) out.push({ key: `backup:${today}`, icon: 'download', tone: 'warn', text: bk.state?.lastAt ? t('nt.backupDue') : t('bk.never'), go: ['options'] });
    if (updateReady) out.push({ key: 'update', icon: 'download', tone: 'info', text: t('nt.update'), run: () => window.dispatchEvent(new Event('mz-update-ready')) });
    const order = { bad: 0, warn: 1, info: 2 };
    return out.sort((x, y) => (order[x.tone] ?? 3) - (order[y.tone] ?? 3));
  }, [attention, farm.animals, today, t, bk?.due, bk?.state?.lastAt, updateReady, app.demo]);

  const now = Date.now();
  const visible = alerts.filter((a) => !(st.hidden?.[a.key] > now));
  const unreadAlerts = visible.filter((a) => !st.read?.[a.key]);

  // Activity by everyone (owners and managers); others see only their own entries.
  const seeAll = can(actor?.role, 'settings');
  const activity = useMemo(() => {
    const all = activityLog(farm).filter((e) => seeAll || e.byId === actor?.id);
    return all.slice(0, 60);
  }, [farm, seeAll, actor?.id]);
  const seenAt = st.seenAt || '';
  const newActivity = activity.filter((e) => e.byId !== actor?.id && e.at > seenAt && e.kind !== 'signout');
  const security = newActivity.filter((e) => e.kind === 'failed' || e.kind === 'lockout');

  return {
    alerts: visible, unreadAlerts, activity, newActivity, security, st, update, seeAll, lang, names,
    count: unreadAlerts.length + newActivity.length,
    markRead: (key) => update((c) => ({ ...c, read: { ...(c.read || {}), [key]: Date.now() } })),
    hide: (key, ms = DAY) => update((c) => ({ ...c, hidden: { ...(c.hidden || {}), [key]: Date.now() + ms }, read: { ...(c.read || {}), [key]: Date.now() } })),
    markAll: () => update((c) => ({ ...c, seenAt: new Date().toISOString(), read: { ...(c.read || {}), ...Object.fromEntries(visible.map((a) => [a.key, Date.now()])) } })),
    seeActivity: () => update((c) => ({ ...c, seenAt: new Date().toISOString() })),
  };
}

const NotifyCtx = createContext(null);
/** One notification state for the whole desk (bell, settings, system notifications). */
export function NotifyProvider({ children }) {
  const n = useNotifications();
  return <NotifyCtx.Provider value={n}><NotifyEngine n={n} />{children}</NotifyCtx.Provider>;
}
export const useNotify = () => useContext(NotifyCtx);

/* ───────────── Pushing to the system tray ───────────── */
export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

async function showSystem(title, body, tag, go) {
  const opts = { body, tag, icon: 'icon-192.png', badge: 'favicon.png', data: { go }, lang: document.documentElement.lang, dir: document.documentElement.dir, renotify: false };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall back below */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; } catch { /* not allowed */ }
}

/** Sends new alerts (and others' activity) to the system once each. Lives once in the shell. */
export function NotifyEngine({ n }) {
  const { t, farm, actor, nav } = useApp();
  const first = useRef(true);
  // Notification clicks come back from the service worker as a route.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const on = (e) => { if (e.data?.type === 'mz-nav' && Array.isArray(e.data.go)) nav(...e.data.go); };
    navigator.serviceWorker.addEventListener('message', on);
    return () => navigator.serviceWorker.removeEventListener('message', on);
  }, [nav]);
  // App icon badge on installed apps.
  useEffect(() => {
    try { if (n.count) navigator.setAppBadge?.(n.count); else navigator.clearAppBadge?.(); } catch { /* not supported */ }
  }, [n.count]);
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== 'granted' || !n.st.push || !actor) return;
    const pushed = n.st.pushed || {};
    const fresh = n.alerts.filter((a) => !pushed[a.key] && !n.st.read?.[a.key] && (!n.st.urgentOnly || a.tone === 'bad'));
    const acts = n.st.urgentOnly ? n.security : n.newActivity.filter((e) => !pushed[`act:${e.at}`]);
    // On the first run after opening, only push what is urgent, so a fresh start isn't a flood.
    const list = first.current ? fresh.filter((a) => a.tone === 'bad') : fresh;
    first.current = false;
    if (!list.length && !acts.length) return;
    const brand = farm.settings.farmName || t('brand');
    list.slice(0, 4).forEach((a) => showSystem(brand, a.text, a.key, a.go || null));
    if (list.length > 4) showSystem(brand, t('nt.more', { n: list.length - 4 }), 'more', null);
    const newActs = acts.filter((e) => !pushed[`act:${e.at}`]);
    if (newActs.length) {
      const sec = newActs.filter((e) => e.kind === 'failed' || e.kind === 'lockout');
      const body = sec.length ? t('nt.secPush', { n: sec.length }) : t('nt.actPush', { n: newActs.length, who: [...new Set(newActs.map((e) => e.by))].slice(0, 2).join('، ') });
      showSystem(brand, body, 'activity', ['activity']);
    }
    n.update((c) => ({ ...c, pushed: { ...(c.pushed || {}), ...Object.fromEntries(fresh.map((a) => [a.key, Date.now()])), ...Object.fromEntries(newActs.map((e) => [`act:${e.at}`, Date.now()])) } }));
  }, [n.alerts, n.newActivity, n.st.push]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ───────────── The bell ───────────── */
export function NotificationBell() {
  const n = useNotify();
  const { t, nav, ui, lang, farm } = useApp();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('alerts');
  const ref = useRef(null);
  const [ring, setRing] = useState(false);
  const prev = useRef(n.count);
  useEffect(() => { if (n.count > prev.current) { setRing(true); const id = setTimeout(() => setRing(false), 1200); prev.current = n.count; return () => clearTimeout(id); } prev.current = n.count; return undefined; }, [n.count]);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = () => { const o = !open; setOpen(o); if (o) setTab(n.unreadAlerts.length || !n.newActivity.length ? 'alerts' : 'activity'); };
  const goTo = (a) => { n.markRead(a.key); setOpen(false); if (a.run) a.run(); else if (a.action) ui.open(a.action.kind, a.action.props); else if (a.go) nav(...a.go); };
  const stamp = (at) => {
    const d = Date.now() - new Date(at).getTime();
    if (d < 60000) return t('nt.now');
    if (d < 3600000) return t('nt.min', { n: Math.round(d / 60000) });
    if (d < DAY) return t('nt.hr', { n: Math.round(d / 3600000) });
    return new Date(at).toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  };
  const what = (e) => (e.type ? `${t(`act.${e.kind}`)} · ${t(`t.${e.type}`)}` : e.kind === 'change' ? (e.label || t('act.change')) : t(`act.${e.kind}`));
  const seenAt = n.st.seenAt || '';
  const perm = pushSupported() ? Notification.permission : 'unsupported';
  const enablePush = async () => {
    const p = perm === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p === 'granted') { n.update((c) => ({ ...c, push: true })); showSystem(farm.settings.farmName || t('brand'), t('nt.pushOn'), 'welcome', null); }
  };
  return (
    <div className="bell-wrap" ref={ref}>
      <button type="button" className={`bell ${ring ? 'ring' : ''} ${open ? 'on' : ''}`} onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-label={t('nt.title')} title={t('nt.title')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {n.count > 0 && <span className={`bell-count ${n.unreadAlerts.some((a) => a.tone === 'bad') || n.security.length ? 'bad' : ''}`} key={n.count}>{n.count > 99 ? '99+' : n.count}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label={t('nt.title')}>
          <div className="bp-head">
            <b>{t('nt.title')}</b>
            {n.count > 0 && <button type="button" className="link small" onClick={n.markAll}>{t('nt.markAll')}</button>}
          </div>
          <div className="bp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'alerts'} className={tab === 'alerts' ? 'on' : ''} onClick={() => setTab('alerts')}>{t('nt.alerts')}{n.unreadAlerts.length > 0 && <span className="bp-n">{n.unreadAlerts.length}</span>}</button>
            <button type="button" role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'on' : ''} onClick={() => { setTab('activity'); }}>{t('nt.activity')}{n.newActivity.length > 0 && <span className="bp-n">{n.newActivity.length}</span>}</button>
          </div>
          <div className="bp-body">
            {tab === 'alerts' ? (
              n.alerts.length ? (
                <ul className="bp-list">
                  {n.alerts.map((a, i) => (
                    <li key={a.key} className={`bp-item tone-${a.tone} ${n.st.read?.[a.key] ? 'read' : ''}`} style={{ '--i': i }}>
                      <button type="button" className="bp-main" onClick={() => goTo(a)}>
                        <span className="bp-ico"><Icon name={a.icon || 'alert'} size={16} /></span>
                        <span className="bp-text">{a.text}</span>
                        {!n.st.read?.[a.key] && <i className="bp-dot" aria-label={t('nt.unread')} />}
                      </button>
                      <button type="button" className="bp-hide" onClick={() => n.hide(a.key)} title={t('nt.snooze')} aria-label={t('nt.snooze')}><Icon name="close" size={13} /></button>
                    </li>
                  ))}
                </ul>
              ) : <div className="bp-empty"><Icon name="check" size={22} /><span>{t('nt.allClear')}</span></div>
            ) : (
              n.activity.length ? (
                <ul className="bp-list is-act">
                  {n.activity.slice(0, 30).map((e, i) => {
                    const prof = farm.profiles.find((p) => p.id === e.byId);
                    const fresh = e.at > seenAt && e.byId !== undefined;
                    return (
                      <li key={`${e.at}-${i}`} className={`bp-item ${fresh ? '' : 'read'} ${['failed', 'lockout'].includes(e.kind) ? 'tone-bad' : ''}`} style={{ '--i': i }}>
                        <button type="button" className="bp-main" onClick={() => { setOpen(false); if (e.recordId) ui.open('drawer', { id: e.recordId }); else if (n.seeAll) nav('activity'); }}>
                          <span className="bp-ico">{prof ? <Avatar p={prof} size={24} /> : <Icon name={KIND_ICON[e.kind] || 'file'} size={15} />}</span>
                          <span className="bp-text"><b>{e.by}</b> {what(e)}{e.reason ? <small className="muted"> · {e.reason}</small> : null}</span>
                          <span className="bp-at muted small num">{stamp(e.at)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <div className="bp-empty"><Icon name="history" size={22} /><span>{t('nt.noActivity')}</span></div>
            )}
          </div>
          <div className="bp-foot">
            {tab === 'activity' && n.seeAll && <button type="button" className="link small" onClick={() => { setOpen(false); n.seeActivity(); nav('activity'); }}>{t('nt.fullLog')}</button>}
            {tab === 'activity' && n.newActivity.length > 0 && <button type="button" className="link small" onClick={n.seeActivity}>{t('nt.seen')}</button>}
            <span className="grow" />
            {perm === 'unsupported' ? null : n.st.push && perm === 'granted'
              ? <button type="button" className="link small" onClick={() => { setOpen(false); nav('options'); setTimeout(() => document.getElementById('notify')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}><Icon name="gear" size={13} /> {t('nt.settings')}</button>
              : perm === 'denied' ? <span className="muted small">{t('nt.blocked')}</span>
                : <Button size="sm" variant="primary" onClick={enablePush}>{t('nt.enable')}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Settings → Notifications. */
export function NotifySettings() {
  const n = useNotify();
  const { t, farm } = useApp();
  const [, force] = useState(0);
  if (!n) return null;
  const perm = pushSupported() ? Notification.permission : 'unsupported';
  const turnOn = async (v) => {
    if (!v) { n.update((c) => ({ ...c, push: false })); return; }
    const p = perm === 'granted' ? 'granted' : await Notification.requestPermission();
    force((x) => x + 1);
    if (p === 'granted') { n.update((c) => ({ ...c, push: true })); showSystem(farm.settings.farmName || t('brand'), t('nt.pushOn'), 'welcome', null); }
  };
  return (
    <section className="panel" id="notify">
      <h2>{t('nt.title')}</h2>
      {perm === 'unsupported' ? <p className="muted">{t('nt.unsupported')}</p> : (
        <>
          <Check label={t('nt.pushLabel')} hint={perm === 'denied' ? t('nt.blockedHint') : t('nt.pushHint')} checked={!!n.st.push && perm === 'granted'} onChange={turnOn} />
          {n.st.push && perm === 'granted' && (
            <Check label={t('nt.urgentOnly')} hint={t('nt.urgentHint')} checked={!!n.st.urgentOnly} onChange={(v) => n.update((c) => ({ ...c, urgentOnly: v }))} />
          )}
          <p className="muted small">{t('nt.whatList')}</p>
        </>
      )}
    </section>
  );
}
