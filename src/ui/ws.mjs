// Workspace: page tabs with their own back/forward history, and floating windows.
// Pure functions over one state object so the behaviour is easy to test.

export const MAX_TABS = 8;
export const MAX_WINDOWS = 6;

export const routeKey = (r) => [r?.name || 'cash', r?.id, r?.tab].filter(Boolean).join('-');
const same = (a, b) => routeKey(a) === routeKey(b);
const clean = (r) => ({ name: r?.name || 'cash', id: r?.id || null, tab: r?.tab || null });

export function wsInit(route) {
  return { tabs: [{ id: 't1', route: clean(route), back: [], fwd: [] }], active: 't1', windows: [], seq: 1, z: 1 };
}

export function wsValid(ws) {
  return !!ws && Array.isArray(ws.tabs) && ws.tabs.length > 0 && ws.tabs.some((t) => t.id === ws.active) && Array.isArray(ws.windows);
}

export const activeTab = (ws) => ws.tabs.find((t) => t.id === ws.active) || ws.tabs[0];

/** Navigate. A page that is already open in another tab is focused instead of opened twice. */
export function wsNav(ws, route, { newTab = false, replace = false } = {}) {
  const r = clean(route);
  const cur = activeTab(ws);
  if (!newTab && same(cur.route, r)) return ws;
  const open = ws.tabs.find((t) => same(t.route, r));
  if (open && !replace) return { ...ws, active: open.id };
  if (newTab) {
    const seq = ws.seq + 1;
    let tabs = [...ws.tabs, { id: `t${seq}`, route: r, back: [], fwd: [] }];
    if (tabs.length > MAX_TABS) tabs = tabs.filter((t, i) => i !== tabs.findIndex((x) => x.id !== ws.active));
    return { ...ws, tabs, active: `t${seq}`, seq };
  }
  return {
    ...ws,
    tabs: ws.tabs.map((t) => (t.id === cur.id ? { ...t, route: r, back: replace ? t.back : [...t.back, t.route].slice(-30), fwd: [] } : t)),
  };
}

export function wsBack(ws) {
  const cur = activeTab(ws);
  if (!cur.back.length) return ws;
  const prev = cur.back[cur.back.length - 1];
  return { ...ws, tabs: ws.tabs.map((t) => (t.id === cur.id ? { ...t, route: prev, back: t.back.slice(0, -1), fwd: [t.route, ...t.fwd].slice(0, 30) } : t)) };
}

export function wsForward(ws) {
  const cur = activeTab(ws);
  if (!cur.fwd.length) return ws;
  const next = cur.fwd[0];
  return { ...ws, tabs: ws.tabs.map((t) => (t.id === cur.id ? { ...t, route: next, back: [...t.back, t.route], fwd: t.fwd.slice(1) } : t)) };
}

export const wsActivate = (ws, id) => (ws.tabs.some((t) => t.id === id) ? { ...ws, active: id } : ws);

export function wsCloseTab(ws, id) {
  if (ws.tabs.length === 1) return { ...ws, tabs: [{ ...ws.tabs[0], route: clean({ name: 'cash' }), back: [], fwd: [] }] };
  const i = ws.tabs.findIndex((t) => t.id === id);
  const tabs = ws.tabs.filter((t) => t.id !== id);
  const active = ws.active === id ? tabs[Math.max(0, i - 1)].id : ws.active;
  return { ...ws, tabs, active };
}

export function wsMoveTab(ws, id, toIndex) {
  const from = ws.tabs.findIndex((t) => t.id === id);
  if (from < 0) return ws;
  const tabs = [...ws.tabs];
  const [t] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, t);
  return { ...ws, tabs };
}

/* ── Windows ── */
export function winOpen(ws, route, area = { w: 1200, h: 800 }) {
  const r = clean(route);
  const exists = ws.windows.find((w) => same(w.route, r));
  if (exists) return winFocus({ ...ws, windows: ws.windows.map((w) => (w.id === exists.id ? { ...w, state: w.state === 'min' ? w.prev || 'normal' : w.state } : w)) }, exists.id);
  const seq = ws.seq + 1;
  const n = ws.windows.length;
  const w = Math.min(560, Math.round(area.w * 0.48));
  const h = Math.min(640, Math.round(area.h * 0.78));
  const win = { id: `w${seq}`, route: r, x: 40 + (n % 5) * 34, y: 24 + (n % 5) * 30, w, h, state: 'normal', z: ws.z + 1, accent: seq % 5 };
  let windows = [...ws.windows, win];
  if (windows.length > MAX_WINDOWS) windows = windows.slice(1);
  return { ...ws, windows, seq, z: ws.z + 1 };
}

export const winFocus = (ws, id) => ({ ...ws, z: ws.z + 1, windows: ws.windows.map((w) => (w.id === id ? { ...w, z: ws.z + 1 } : w)) });
export const winPatch = (ws, id, patch) => ({ ...ws, windows: ws.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
export const winClose = (ws, id) => ({ ...ws, windows: ws.windows.filter((w) => w.id !== id) });

export function winNav(ws, id, route) {
  return { ...ws, windows: ws.windows.map((w) => (w.id === id ? { ...w, route: clean(route), back: [...(w.back || []), w.route].slice(-20) } : w)) };
}
export function winBack(ws, id) {
  return {
    ...ws,
    windows: ws.windows.map((w) => (w.id === id && w.back?.length ? { ...w, route: w.back[w.back.length - 1], back: w.back.slice(0, -1) } : w)),
  };
}

export function winToggle(ws, id, state) {
  return {
    ...ws,
    windows: ws.windows.map((w) => {
      if (w.id !== id) return w;
      if (w.state === state) return { ...w, state: w.prev || 'normal', prev: undefined };
      return { ...w, prev: w.state === 'min' ? w.prev : w.state, state };
    }),
  };
}

/** Turn a window back into a tab in the main area. */
export function winDock(ws, id) {
  const w = ws.windows.find((x) => x.id === id);
  if (!w) return ws;
  return wsNav(winClose(ws, id), w.route, { newTab: true });
}

/** Where a dragged window should snap, from the pointer position inside the work area. */
export function snapFor(x, y, area, edge = 14) {
  if (y <= edge) return 'max';
  if (x <= edge) return 'snapL';
  if (x >= area.w - edge) return 'snapR';
  return null;
}

/** Modifier keys from the last click, so any nav() can open a new tab (Ctrl/⌘) or a window (Shift). */
let lastClick = { at: 0, newTab: false, window: false };
export function installClickModifiers() {
  if (typeof window === 'undefined' || window.__navMods) return;
  window.__navMods = true;
  window.addEventListener('click', (e) => { lastClick = { at: Date.now(), newTab: e.ctrlKey || e.metaKey, window: e.shiftKey }; }, true);
}
export function clickModifiers() {
  return Date.now() - lastClick.at < 400 ? lastClick : { newTab: false, window: false };
}
