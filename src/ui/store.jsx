import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LOGO } from './logo-data.js';
import { play as playSound, setSoundOn } from './sound.js';
import { setMilkView } from './units.js';
import { emptyFarm, autoPurge, CommandError, newId } from '../core/commands.mjs';
import { appendAudit, changedLists } from '../core/audit.mjs';
import { liveFileIds } from '../core/documents.mjs';
import { vault, K } from './vault.js';
import { compute } from '../core/ledger.mjs';
import { visibleFarm } from '../core/removal.mjs';
import { normalise } from '../core/backup.mjs';
import { fmtMoney } from '../core/money.mjs';
import { isoDay } from '../core/species.mjs';
import { makeT } from '../i18n.js';
import * as WS from './ws.mjs';

export const KEYS = { ws: 'mazraati-ws-v1', farm: 'mazraati-farm-v4', held: 'mazraati-farm-v4-held', device: 'mazraati-device-v4', snaps: 'mazraati-snaps-v4', drafts: 'mazraati-drafts-v4', farms: 'mazraati-farms-v1', backups: 'mazraati-backups-v1', attempts: 'mazraati-attempts-v1', snapDay: 'mazraati-snapday-v1' };
export const VERSION = { name: '3.13.0', season: { ar: 'الموسم الثاني', en: 'Second Season' } };
export const MAX_BYTES = 4.6 * 1024 * 1024;

export const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, v); },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export function readJSON(k, fallback) {
  try { const s = storage.get(k); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
const writeJSON = (k, v) => { try { storage.set(k, JSON.stringify(v)); } catch { /* small device keys */ } };

/* ── Farms on this device ── */
export function readRegistry() {
  const r = readJSON(KEYS.farms, null);
  return r && Array.isArray(r.farms) && r.farms.length ? r : null;
}
const writeRegistry = (r) => writeJSON(KEYS.farms, r);
const ready = (raw) => (raw && Array.isArray(raw.records) ? autoPurge(normalise(raw)) : emptyFarm());

/** First start of this version: move the single farm kept in localStorage into the vault. */
async function bootRegistry() {
  let reg = readRegistry();
  if (reg) return reg;
  const id = 'main';
  const legacy = readJSON(KEYS.farm, null);
  reg = { active: id, farms: [{ id, name: legacy?.settings?.farmName || '', createdAt: new Date().toISOString(), demo: !!storage.get(KEYS.held) }] };
  if ((await vault.mode()) === 'idb') {
    if (legacy) await vault.set(K.farm(id), legacy);
    const held = readJSON(KEYS.held, null); if (held) await vault.set(K.held(id), held);
    const snaps = readJSON(KEYS.snaps, null); if (snaps) await vault.set(K.snaps(id), snaps);
    storage.del(KEYS.farm); storage.del(KEYS.held); storage.del(KEYS.snaps);
  } else if (legacy) {
    try { await vault.set(K.farm(id), legacy); storage.del(KEYS.farm); } catch { /* stays where it was; loadFarm reads it */ }
  }
  writeRegistry(reg);
  return reg;
}

async function loadFarmById(id) {
  let raw = await vault.get(K.farm(id));
  if (!raw && id === 'main') raw = readJSON(KEYS.farm, null);
  return ready(raw);
}

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [boot, setBoot] = useState(null); // { reg, farm } once loaded
  useEffect(() => {
    let live = true;
    (async () => {
      const reg = await bootRegistry();
      const farm = await loadFarmById(reg.active);
      if (live) setBoot({ reg, farm, mode: await vault.mode() });
    })().catch(() => live && setBoot({ reg: { active: 'main', farms: [{ id: 'main', name: '' }] }, farm: emptyFarm(), mode: 'ls' }));
    return () => { live = false; };
  }, []);
  if (!boot) return <div className="boot" aria-busy="true"><span className="brand-mark app-logo"><img src={LOGO} alt="" /></span></div>;
  return <FarmProvider boot={boot}>{children}</FarmProvider>;
}

function FarmProvider({ boot, children }) {
  const [farm, setFarm] = useState(boot.farm);
  const [reg, setRegState] = useState(boot.reg);
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
  const farmId = reg.active;
  const regFarm = reg.farms.find((x) => x.id === farmId) || reg.farms[0];
  const demo = !!regFarm?.demo;
  const setReg = useCallback((fn) => setRegState((r) => { const n = typeof fn === 'function' ? fn(r) : fn; writeRegistry(n); return n; }), []);

  useEffect(() => {
    const id = setInterval(() => setToday(isoDay()), 60000);
    const onHash = () => setWs((w) => WS.wsNav(w, parseHash()));
    window.addEventListener('hashchange', onHash);
    return () => { clearInterval(id); window.removeEventListener('hashchange', onHash); };
  }, []);

  // Saves go to the vault one at a time; the newest waiting farm wins.
  const saving = useRef({ busy: false, next: null });
  const idRef = useRef(farmId); idRef.current = farmId;
  const demoRef = useRef(demo); demoRef.current = demo;
  const flush = useCallback(async () => {
    const q = saving.current;
    if (q.busy || !q.next) return;
    q.busy = true;
    const { f, id } = q.next; q.next = null;
    try {
      if (boot.mode !== 'idb' && JSON.stringify(f).length > MAX_BYTES) throw new CommandError('storage');
      await vault.set(K.farm(id), f);
      setSaveError(null);
      // One automatic snapshot per day.
      const day = isoDay();
      const marks = readJSON(KEYS.snapDay, {});
      if (!demoRef.current && f.records.length && marks[id] !== day) {
        const snaps = (await vault.get(K.snaps(id))) || [];
        writeJSON(KEYS.snapDay, { ...marks, [id]: day });
        if (!snaps[0] || snaps[0].day !== day) {
          const keep = boot.mode === 'idb' ? 7 : 2;
          const next = [{ day, at: new Date().toISOString(), size: JSON.stringify(f).length, farm: f }, ...snaps].slice(0, keep);
          try { await vault.set(K.snaps(id), next); } catch { try { await vault.set(K.snaps(id), next.slice(0, 1)); } catch { /* snapshots are a convenience */ } }
        }
      }
    } catch (e) {
      setSaveError({ code: e.code === 'storage' || e.name === 'QuotaExceededError' ? 'storage' : 'saveFailed', farm: f });
    } finally {
      q.busy = false;
      if (q.next) flush();
    }
  }, [boot.mode]);
  // Writing a big farm copies it; do that just after the screen has painted, and at once if the app is closing.
  const timer = useRef(null);
  const later = useCallback(() => {
    if (timer.current) return;
    const go = () => { timer.current = null; flush(); };
    timer.current = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => { timer.current = setTimeout(go, 0); }) : setTimeout(go, 0);
  }, [flush]);
  useEffect(() => {
    const now = () => { if (saving.current.next) flush(); };
    const vis = () => document.visibilityState === 'hidden' && now();
    window.addEventListener('pagehide', now); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', now); document.removeEventListener('visibilitychange', vis); };
  }, [flush]);
  const persist = useCallback((f) => {
    saving.current.next = { f, id: idRef.current };
    later();
    // Keep the farm's name in the device list.
    const nm = f.settings.farmName || '';
    setReg((r) => (r.farms.some((x) => x.id === idRef.current && x.name !== nm) ? { ...r, farms: r.farms.map((x) => (x.id === idRef.current ? { ...x, name: nm } : x)) } : r));
    return true;
  }, [later, setReg]);

  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const n = { ...p, ...patch };
      try { storage.set(KEYS.device, JSON.stringify(n)); } catch { /* device prefs are optional */ }
      return n;
    });
  }, []);

  const t = useMemo(() => makeT(prefs.lang), [prefs.lang]);
  setSoundOn(prefs.sound);
  setMilkView(farm.settings.milkUnit, t, farm.settings);
  const actor = useMemo(() => farm.profiles.find((p) => p.id === prefs.profileId) || null, [farm.profiles, prefs.profileId]);
  const actorRef = useRef(actor); actorRef.current = actor;

  const toast = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((x) => [...x.slice(-2), { id, msg, ...opts }]);
    playSound(opts.sound || (opts.tone === 'bad' ? 'fail' : null));
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), opts.ms || (opts.action ? 10000 : 3500));
  }, []);

  // The latest farm. Set wherever the farm changes (never from render), so saves made in quick
  // succession always build on each other even while the screen catches up.
  const farmRef = useRef(farm);

  const errText = useCallback((e) => {
    const code = e?.code || 'error';
    if (code === 'locked') return t('e.locked', { d: e.detail?.lock });
    return t(`e.${code}`) !== `e.${code}` ? t(`e.${code}`) : t('e.error');
  }, [t]);

  /** Apply a pure command. Returns the new farm, or null when the command refused. */
  const commit = useCallback((op, { label, silent, undoable = true } = {}) => {
    let next;
    const before = farmRef.current;
    try {
      next = op(farmRef.current);
    } catch (e) {
      toast(errText(e), { tone: 'bad' });
      return null;
    }
    if (next === farmRef.current) return next;
    // Changes outside the records (lists, settings) go in the activity log.
    const lists = changedLists(farmRef.current, next);
    if (lists.length && label) next = appendAudit(next, { kind: 'change', lists, label, by: actorRef.current?.id || null, byName: actorRef.current?.name || '—' });
    if (undoable) undoRef.current = [...undoRef.current.slice(-19), { prev: farmRef.current, label }];
    farmRef.current = next;
    if (silent || !label) {
      // Fields that save as you type (settings, toggles) must update at once.
      setFarm(next);
    } else {
      // Saved entries: the sheet closes and the toast paints first; balances on big farms refresh right after.
      const apply = () => startTransition(() => { if (farmRef.current === next) setFarm(next); });
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(apply, 0)); else apply();
    }
    persist(next);
    if (!silent && label) {
      // A new sale rings the till; everything else gets the soft success note.
      const sold = next.records.length > before.records.length && next.records.slice(before.records.length).some((r) => r.type === 'sale' && !r.deletedAt);
      toast(label, { sound: sold ? 'cash' : 'success', action: undoable ? { label: t('undo'), run: () => undo() } : null });
    }
    return next;
  }, [persist, toast, errText, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Record an event (sign-in, backup, …) without touching the undo history. */
  const logEvent = useCallback((kind, extra = {}, who = actorRef.current) => {
    const next = appendAudit(farmRef.current, { kind, by: who?.id || null, byName: who?.name || '—', ...extra });
    farmRef.current = next;
    setFarm(next);
    persist(next);
  }, [persist]);

  const undo = useCallback(() => {
    const last = undoRef.current.pop();
    if (!last) return;
    // The activity log is never undone.
    const prev = appendAudit({ ...last.prev, audit: farmRef.current.audit }, { kind: 'undo', label: last.label || '', by: actorRef.current?.id || null, byName: actorRef.current?.name || '—' });
    farmRef.current = prev;
    setFarm(prev);
    persist(prev);
    toast(`${t('undo')}: ${last.label || ''}`.trim());
  }, [persist, toast, t]);

  const replaceFarm = useCallback((f) => {
    undoRef.current = [];
    farmRef.current = f;
    setFarm(f);
    persist(f);
  }, [persist]);

  const retrySave = useCallback(() => { if (saveError?.farm) persist(saveError.farm); }, [saveError, persist]);

  /* ── Files (attached documents) ── */
  const files = useMemo(() => ({
    async save(dataUrl) { const id = newId('file'); await vault.set(K.file(id), dataUrl); return id; },
    get: (id) => vault.get(K.file(id)),
    del: (id) => vault.del(K.file(id)),
    async collect(f) { const out = {}; for (const id of liveFileIds(f)) { const v = await vault.get(K.file(id)); if (v) out[id] = v; } return out; },
    async put(map) { for (const [id, v] of Object.entries(map || {})) await vault.set(K.file(id), v); },
  }), []);

  /* ── Demo farm ── */
  const enterDemo = useCallback(async (sample) => {
    await vault.set(K.held(idRef.current), farmRef.current);
    setReg((r) => ({ ...r, farms: r.farms.map((x) => (x.id === idRef.current ? { ...x, demo: true } : x)) }));
    demoRef.current = true;
    replaceFarm(sample);
  }, [replaceFarm, setReg]);
  const exitDemo = useCallback(async () => {
    let held = await vault.get(K.held(idRef.current));
    if (!held && idRef.current === 'main') held = readJSON(KEYS.held, null);
    await vault.del(K.held(idRef.current)); storage.del(KEYS.held);
    setReg((r) => ({ ...r, farms: r.farms.map((x) => (x.id === idRef.current ? { ...x, demo: false } : x)) }));
    demoRef.current = false;
    const f = ready(held);
    replaceFarm(f);
    return f;
  }, [replaceFarm, setReg]);

  /* ── Several farms on one device ── */
  const switchFarm = useCallback(async (id) => {
    if (id === idRef.current) return;
    logEvent('switchFarm', { to: id });
    await new Promise((r) => setTimeout(r, 30));
    const next = await loadFarmById(id);
    undoRef.current = [];
    idRef.current = id;
    farmRef.current = next;
    setReg((r) => ({ ...r, active: id }));
    setFarm(next);
    setStack([]);
    setPrefs({ profileId: null });
  }, [logEvent, setReg, setPrefs]);
  const addFarm = useCallback(async () => {
    const id = newId('farm');
    const f = emptyFarm();
    await vault.set(K.farm(id), f);
    setReg((r) => ({ ...r, active: id, farms: [...r.farms, { id, name: '', createdAt: new Date().toISOString() }] }));
    undoRef.current = [];
    idRef.current = id;
    farmRef.current = f;
    setFarm(f);
    setStack([]);
    setPrefs({ profileId: null });
  }, [setReg, setPrefs]);
  const removeFarm = useCallback(async (id) => {
    if (reg.farms.length < 2) return false;
    const f = id === idRef.current ? farmRef.current : await vault.get(K.farm(id));
    for (const fid of liveFileIds(f || {})) await vault.del(K.file(fid));
    await vault.del(K.farm(id)); await vault.del(K.snaps(id)); await vault.del(K.held(id)); await vault.del(K.backupDir(id));
    const rest = reg.farms.filter((x) => x.id !== id);
    if (id === idRef.current) {
      const to = rest[0].id;
      const next = await loadFarmById(to);
      idRef.current = to; farmRef.current = next; undoRef.current = [];
      setFarm(next); setStack([]); setPrefs({ profileId: null });
      setReg({ ...reg, active: to, farms: rest });
    } else setReg({ ...reg, farms: rest });
    return true;
  }, [reg, setReg, setPrefs]);
  const cancelNewFarm = useCallback(async () => {
    // Leaving a farm that was never set up removes it.
    const cur = reg.farms.find((x) => x.id === idRef.current);
    if (!cur || farmRef.current.settings.setupDone || reg.farms.length < 2) return;
    const id = cur.id;
    await vault.del(K.farm(id));
    const rest = reg.farms.filter((x) => x.id !== id);
    const to = rest[0].id;
    const next = await loadFarmById(to);
    idRef.current = to; farmRef.current = next; undoRef.current = [];
    setFarm(next); setReg({ ...reg, active: to, farms: rest });
  }, [reg, setReg]);
  const snapshots = useCallback(async () => (await vault.get(K.snaps(idRef.current))) || (idRef.current === 'main' ? readJSON(KEYS.snaps, []) : []), []);
  const clearDeviceCopies = useCallback(async () => { await vault.del(K.snaps(idRef.current)); storage.del(KEYS.snaps); storage.del(KEYS.drafts); }, []);

  /* ── Auto-lock after inactivity ── */
  const lockMin = farm.settings.security?.autoLockMin || 0;
  useEffect(() => {
    if (!lockMin || !actor) return undefined;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - last >= lockMin * 60000) {
        logEvent('autolock', {}, actorRef.current);
        setStack([]);
        setPrefs({ profileId: null });
      }
    }, 15000);
    return () => { clearInterval(id); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, [lockMin, actor, logEvent, setPrefs]);

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
    logEvent, files, enterDemo, exitDemo, farms: reg.farms, farmId, switchFarm, addFarm, removeFarm, cancelNewFarm, snapshots, clearDeviceCopies, storageMode: boot.mode,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ROUTES = ['cash', 'people', 'animals', 'production', 'expenses', 'suppliers', 'sales', 'accounts', 'reports', 'activity', 'guide', 'options', 'trash'];
function parseHash() {
  const h = (typeof location !== 'undefined' ? location.hash.slice(1) : '') || 'cash';
  const parts = h.split('-');
  const name = ROUTES.includes(parts[0]) ? parts[0] : 'cash';
  // ids themselves contain dashes; the last part may be a tab name
  const rest = parts.slice(1);
  const tabs = ['statement', 'bills', 'payments', 'activity', 'milk', 'eggs', 'workers', 'log', 'customers', 'cashier', 'invoices', 'open', 'obligations', 'pl', 'bs', 'aging', 'journal', 'tax', 'sold', 'orders', 'reminders'];
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
