import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emptyFarm, autoPurge, CommandError } from '../core/commands.mjs';
import { compute } from '../core/ledger.mjs';
import { visibleFarm } from '../core/removal.mjs';
import { normalise } from '../core/backup.mjs';
import { fmtMoney } from '../core/money.mjs';
import { isoDay } from '../core/species.mjs';
import { makeT } from '../i18n.js';
import * as WS from './ws.mjs';

export const KEYS = { ws: 'mazraati-ws-v1', farm: 'mazraati-farm-v4', held: 'mazraati-farm-v4-held', device: 'mazraati-device-v4', snaps: 'mazraati-snaps-v4', drafts: 'mazraati-drafts-v4' };
export const VERSION = { name: '3.6.0', season: { ar: 'الموسم الثاني', en: 'Second Season' } };
export const MAX_BYTES = 4.6 * 1024 * 1024;

export const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, v); },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export function readJSON(k, fallback) {
  try { const s = storage.get(k); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function loadFarm() {
  const f = readJSON(KEYS.farm, null);
  if (f && Array.isArray(f.records)) return autoPurge(normalise(f));
  return emptyFarm();
}

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [farm, setFarm] = useState(loadFarm);
  const [prefs, setPrefsState] = useState(() => ({ lang: 'ar', theme: 'system', money: 'base', profileId: null, dismissed: {}, ...readJSON(KEYS.device, {}) }));
  const [saveError, setSaveError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [layer, setLayer] = useState(null); // {kind, props}
  const [stack, setStack] = useState([]); // modal stack
  const [ws, setWsState] = useState(() => {
    const saved = readJSON(KEYS.ws, null);
    const hashed = typeof location !== 'undefined' && location.hash.length > 1;
    if (WS.wsValid(saved)) return hashed ? WS.wsNav(saved, parseHash()) : saved;
    return WS.wsInit(parseHash());
  });
  const setWs = useCallback((fn) => setWsState((prev) => {
    const next = typeof fn === 'function' ? fn(prev) : fn;
    try { storage.set(KEYS.ws, JSON.stringify(next)); } catch { /* layout is optional */ }
    return next;
  }), []);
  const route = WS.activeTab(ws).route;
  const undoRef = useRef([]);
  const [today, setToday] = useState(isoDay());
  const demo = !!storage.get(KEYS.held);

  useEffect(() => {
    const id = setInterval(() => setToday(isoDay()), 60000);
    const onHash = () => setWs((w) => WS.wsNav(w, parseHash()));
    window.addEventListener('hashchange', onHash);
    return () => { clearInterval(id); window.removeEventListener('hashchange', onHash); };
  }, []);

  const persist = useCallback((f) => {
    try {
      const s = JSON.stringify(f);
      if (s.length > MAX_BYTES) throw new CommandError('storage');
      storage.set(KEYS.farm, s);
      setSaveError(null);
      // One automatic snapshot per day, last three kept.
      const snaps = readJSON(KEYS.snaps, []);
      const day = isoDay();
      if (!demo && f.records.length && (!snaps[0] || snaps[0].day !== day)) {
        const next = [{ day, at: new Date().toISOString(), size: s.length, farm: f }, ...snaps].slice(0, 3);
        try { storage.set(KEYS.snaps, JSON.stringify(next)); } catch { storage.set(KEYS.snaps, JSON.stringify(next.slice(0, 1))); }
      }
      return true;
    } catch (e) {
      setSaveError({ code: e.code === 'storage' || e.name === 'QuotaExceededError' ? 'storage' : 'saveFailed', farm: f });
      return false;
    }
  }, [demo]);

  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const n = { ...p, ...patch };
      try { storage.set(KEYS.device, JSON.stringify(n)); } catch { /* device prefs are optional */ }
      return n;
    });
  }, []);

  const t = useMemo(() => makeT(prefs.lang), [prefs.lang]);
  const actor = useMemo(() => farm.profiles.find((p) => p.id === prefs.profileId) || null, [farm.profiles, prefs.profileId]);

  const toast = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x.slice(-2), { id, msg, ...opts }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), opts.ms || (opts.action ? 10000 : 3500));
  }, []);

  const farmRef = useRef(farm);
  farmRef.current = farm;

  const errText = useCallback((e) => {
    const code = e?.code || 'error';
    if (code === 'locked') return t('e.locked', { d: e.detail?.lock });
    return t(`e.${code}`) !== `e.${code}` ? t(`e.${code}`) : t('e.error');
  }, [t]);

  /** Apply a pure command. Returns the new farm, or null when the command refused. */
  const commit = useCallback((op, { label, silent, undoable = true } = {}) => {
    let next;
    try {
      next = op(farmRef.current);
    } catch (e) {
      toast(errText(e), { tone: 'bad' });
      return null;
    }
    if (next === farmRef.current) return next;
    if (undoable) undoRef.current = [...undoRef.current.slice(-19), { prev: farmRef.current, label }];
    farmRef.current = next;
    setFarm(next);
    persist(next);
    if (!silent && label) toast(label, { action: undoable ? { label: t('undo'), run: () => undo() } : null });
    return next;
  }, [persist, toast, errText, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback(() => {
    const last = undoRef.current.pop();
    if (!last) return;
    farmRef.current = last.prev;
    setFarm(last.prev);
    persist(last.prev);
    toast(`${t('undo')}: ${last.label || ''}`.trim());
  }, [persist, toast, t]);

  const replaceFarm = useCallback((f) => {
    undoRef.current = [];
    farmRef.current = f;
    setFarm(f);
    persist(f);
  }, [persist]);

  const retrySave = useCallback(() => { if (saveError?.farm) persist(saveError.farm); }, [saveError, persist]);

  const view = useMemo(() => visibleFarm(farm), [farm]);
  const snap = useMemo(() => compute(view), [view]);

  const fmt = useCallback((c, opts = {}) => fmtMoney(c, {
    currency: farm.settings.currency, second: farm.settings.second,
    view: opts.view || 'base',
  }), [farm.settings.currency, farm.settings.second]);

  const names = useMemo(() => ({
    customer: (id) => farm.customers.find((x) => x.id === id)?.name || t('sale.walkin'),
    supplier: (id) => farm.suppliers.find((x) => x.id === id)?.name || '—',
    person: (id) => farm.people.find((x) => x.id === id)?.name || '—',
    animal: (id) => { const a = farm.animals.find((x) => x.id === id); return a ? (a.name ? `${a.name} · ${a.tag}` : a.tag) : '—'; },
    worker: (id) => farm.workers.find((x) => x.id === id)?.name || '—',
  }), [farm.customers, farm.suppliers, farm.people, farm.animals, farm.workers, t]);

  // Keep the address in step with the active tab so pages can be bookmarked and shared.
  useEffect(() => {
    const h = WS.routeKey(route);
    if (location.hash.slice(1) !== h) { try { history.replaceState(null, '', `#${h}`); } catch { location.hash = h; } }
  }, [route]);
  const area = () => ({ w: Math.max(600, window.innerWidth - 300), h: Math.max(400, window.innerHeight - 140) });
  const canWindow = () => typeof window !== 'undefined' && window.innerWidth >= 1100;
  /** nav(name, id, tab, { newTab, window }) */
  useEffect(() => { WS.installClickModifiers(); }, []);
  const nav = useCallback((name, id, tab, given = {}) => {
    const m = WS.clickModifiers();
    const opts = { newTab: given.newTab ?? m.newTab, window: given.window ?? m.window };
    const r = { name, id, tab };
    if (opts.window && canWindow()) setWs((w) => WS.winOpen(w, r, area()));
    else setWs((w) => WS.wsNav(w, r, { newTab: !!(opts.newTab || opts.window) }));
  }, [setWs]);
  const wsApi = useMemo(() => ({
    back: () => setWs(WS.wsBack), forward: () => setWs(WS.wsForward),
    activate: (id) => setWs((w) => WS.wsActivate(w, id)), closeTab: (id) => setWs((w) => WS.wsCloseTab(w, id)),
    moveTab: (id, i) => setWs((w) => WS.wsMoveTab(w, id, i)),
    openWindow: (r) => (canWindow() ? setWs((w) => WS.winOpen(w, r, area())) : setWs((w) => WS.wsNav(w, r, { newTab: true }))),
    winNav: (id, r) => setWs((w) => WS.winNav(w, id, r)), winBack: (id) => setWs((w) => WS.winBack(w, id)),
    winFocus: (id) => setWs((w) => WS.winFocus(w, id)), winPatch: (id, p) => setWs((w) => WS.winPatch(w, id, p)),
    winToggle: (id, st) => setWs((w) => WS.winToggle(w, id, st)), winClose: (id) => setWs((w) => WS.winClose(w, id)),
    winDock: (id) => setWs((w) => WS.winDock(w, id)), canWindow,
  }), [setWs]);

  const ui = useMemo(() => ({
    open: (kind, props = {}) => setStack((s) => [...s, { kind, props, key: Math.random() }]),
    closeTop: () => setStack((s) => s.slice(0, -1)),
    closeAll: () => setStack([]),
    setLayer,
  }), []);

  const value = {
    farm: view, rawFarm: farm, snap, prefs, setPrefs, t, lang: prefs.lang, dir: prefs.lang === 'ar' ? 'rtl' : 'ltr', actor, today,
    commit, undo, replaceFarm, toast, toasts, setToasts, errText, fmt, names, route, nav, ui, stack, layer, ws, wsApi,
    saveError, retrySave, demo, canUndo: undoRef.current.length > 0,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ROUTES = ['cash', 'people', 'animals', 'production', 'expenses', 'suppliers', 'sales', 'accounts', 'reports', 'options', 'trash'];
function parseHash() {
  const h = (typeof location !== 'undefined' ? location.hash.slice(1) : '') || 'cash';
  const parts = h.split('-');
  const name = ROUTES.includes(parts[0]) ? parts[0] : 'cash';
  // ids themselves contain dashes; the last part may be a tab name
  const rest = parts.slice(1);
  const tabs = ['statement', 'bills', 'payments', 'activity', 'milk', 'eggs', 'workers', 'log', 'customers', 'cashier', 'invoices', 'open', 'obligations', 'pl', 'bs', 'aging', 'journal', 'tax'];
  let tab = null;
  if (rest.length && tabs.includes(rest[rest.length - 1])) tab = rest.pop();
  const id = rest.length ? rest.join('-') : null;
  return { name, id, tab };
}

/** Drafts for new entries survive closing the app. */
export function useDraft(key, initial, enabled = true) {
  const [restored, setRestored] = useState(false);
  const [state, setState] = useState(() => {
    if (!enabled) return initial;
    const all = readJSON(KEYS.drafts, {});
    if (all[key]) { setTimeout(() => setRestored(true)); return { ...initial, ...all[key] }; }
    return initial;
  });
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => {
      const all = readJSON(KEYS.drafts, {});
      if (JSON.stringify(state) === JSON.stringify(initial)) delete all[key]; else all[key] = state;
      try { storage.set(KEYS.drafts, JSON.stringify(all)); } catch { /* optional */ }
    }, 400);
    return () => clearTimeout(id);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = () => {
    const all = readJSON(KEYS.drafts, {});
    delete all[key];
    try { storage.set(KEYS.drafts, JSON.stringify(all)); } catch { /* optional */ }
    setRestored(false);
    setState(initial);
  };
  return [state, setState, clear, restored];
}

export const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
