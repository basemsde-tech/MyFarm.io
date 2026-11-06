import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, Ctx } from './store.jsx';
import { Icon, IconButton } from './kit.jsx';
import { CashScreen, SalesScreen, ExpensesScreen, SuppliersScreen, PeopleScreen } from './screens-money.jsx';
import { ProductionScreen, AnimalsScreen, ReportsScreen, SettingsScreen, TrashScreen } from './screens-farm.jsx';
import { AccountsScreen } from './screens-accounts.jsx';
import { ActivityScreen } from './admin.jsx';
import { GuideScreen } from './help.jsx';
import { snapFor, routeKey, clickModifiers } from './ws.mjs';

export const SCREENS = { cash: CashScreen, people: PeopleScreen, animals: AnimalsScreen, production: ProductionScreen, expenses: ExpensesScreen, suppliers: SuppliersScreen, sales: SalesScreen, reports: ReportsScreen, accounts: AccountsScreen, activity: ActivityScreen, guide: GuideScreen, options: SettingsScreen, trash: TrashScreen };
export const ROUTE_ICON = { cash: 'cash', people: 'people', animals: 'cow', production: 'milk', expenses: 'receipt', suppliers: 'truck', sales: 'cart', reports: 'chart', accounts: 'ledger', activity: 'history', guide: 'help', options: 'gear', trash: 'trash' };
export const navLabel = (k) => (k === 'options' ? 'nav.settings' : `nav.${k}`);

export function entityName(r, names) {
  if (!r?.id) return '';
  if (r.name === 'sales') return names.customer(r.id);
  if (r.name === 'suppliers') return names.supplier(r.id);
  if (r.name === 'people') return names.person(r.id);
  if (r.name === 'animals') return names.animal(r.id);
  return '';
}
export function routeLabel(r, t, names) {
  // Accounts live as sub-tabs inside their department: the main tab keeps the department's name.
  if (r?.id && ['sales', 'suppliers', 'people'].includes(r.name)) return t(navLabel(r.name));
  return entityName(r, names) || t(navLabel(r.name));
}

/** Render a screen for any route, with nav() scoped to where it lives (a tab or a window). */
export function RouteScope({ route, nav, inWindow, children }) {
  const app = useApp();
  const value = useMemo(() => ({ ...app, route, nav, inWindow }), [app, route, nav, inWindow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Crumb() {
  const { route, nav, t, names, farm } = useApp();
  const ent = entityName(route, names);
  return (
    <nav className="crumb" aria-label="breadcrumb">
      <span className="crumb-farm">{farm.settings.farmName || t('brand')}</span>
      <Icon name="chev" size={14} className="flip-rtl" />
      {ent ? <button type="button" className="crumb-link" onClick={() => nav(route.name)}>{t(navLabel(route.name))}</button> : <b>{t(navLabel(route.name))}</b>}
      {ent && <><Icon name="chev" size={14} className="flip-rtl" /><b>{ent}</b></>}
    </nav>
  );
}

/** Page tabs. Ctrl/⌘-click opens a page in a new tab, Shift-click in a window. */
export function TabBar() {
  const { ws, wsApi, t, names, nav, route } = useApp();
  const cur = ws.tabs.find((x) => x.id === ws.active);
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null); // { id, after } — where the dragged tab will land
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  // Index to move to, given the tab under the pointer and which half of it.
  const target = (overIdx, after) => {
    const from = ws.tabs.findIndex((x) => x.id === dragId);
    let to = overIdx + (after ? 1 : 0);
    if (from < to) to -= 1;
    return to;
  };
  const sideOf = (e) => { const r = e.currentTarget.getBoundingClientRect(); const right = e.clientX > r.left + r.width / 2; return rtl ? !right : right; };
  const moveBy = (id, d) => { const i = ws.tabs.findIndex((x) => x.id === id); const j = i + d; if (i < 0 || j < 0 || j >= ws.tabs.length) return; wsApi.moveTab(id, j); };
  return (
    <div className="tabbar" role="tablist" aria-label={t('ws.tabs')}>
      <div className="tab-nav">
        <IconButton icon="back" label={t('ws.back')} onClick={wsApi.back} disabled={!cur?.back.length} className="flip-rtl" />
        <IconButton icon="chev" label={t('ws.forward')} onClick={wsApi.forward} disabled={!cur?.fwd.length} className="flip-rtl" />
      </div>
      <div className="tabs-scroll">
        {ws.tabs.map((tb, i) => (
          <div key={tb.id} role="tab" aria-selected={tb.id === ws.active} tabIndex={0} draggable data-ctx="tab" data-id={tb.id}
            className={`ws-tab ${tb.id === ws.active ? 'on' : ''} ${dragId === tb.id ? 'dragging' : ''} ${drop?.id === tb.id && dragId && dragId !== tb.id ? (drop.after ? 'drop-after' : 'drop-before') : ''}`}
            onClick={() => wsApi.activate(tb.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') wsApi.activate(tb.id);
              // Ctrl+Shift+← / → moves the focused tab (keyboard reorder).
              if (e.ctrlKey && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); moveBy(tb.id, (e.key === 'ArrowRight') !== rtl ? 1 : -1); }
            }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); wsApi.closeTab(tb.id); } }}
            onDragStart={(e) => { setDragId(tb.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tb.id); } catch { /* older browsers */ } }}
            onDragEnd={() => { setDragId(null); setDrop(null); }}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch { /* ignore */ } const after = sideOf(e); if (drop?.id !== tb.id || drop?.after !== after) setDrop({ id: tb.id, after }); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop((d) => (d?.id === tb.id ? null : d)); }}
            onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== tb.id) wsApi.moveTab(dragId, target(i, sideOf(e))); setDragId(null); setDrop(null); }}
            title={routeLabel(tb.route, t, names)}>
            <Icon name={ROUTE_ICON[tb.route.name] || 'file'} size={15} />
            <span className="ws-tab-label">{routeLabel(tb.route, t, names)}</span>
            {ws.tabs.length > 1 && <button type="button" className="ws-tab-x" aria-label={t('close')} onClick={(e) => { e.stopPropagation(); wsApi.closeTab(tb.id); }}><Icon name="close" size={13} /></button>}
          </div>
        ))}
        <button type="button" className="ws-tab-add" aria-label={t('ws.newTab')} title={t('ws.newTab')} onClick={() => nav('cash', null, null, { newTab: true })}><Icon name="plus" size={15} /></button>
      </div>
      {wsApi.canWindow() && (
        <button type="button" className="ws-pop" onClick={() => wsApi.openWindow(route)} title={t('ws.popHint')}>
          <Icon name="popout" size={15} /><span>{t('ws.pop')}</span>
        </button>
      )}
    </div>
  );
}

const STATES = { normal: 1, max: 1, snapL: 1, snapR: 1 };

function Win({ w, areaRef, top }) {
  const app = useApp();
  const { wsApi, t, names } = app;
  const [live, setLive] = useState(null); // geometry while dragging or resizing
  const [snap, setSnap] = useState(null);
  const ref = useRef(null);
  const area = () => {
    const r = areaRef.current?.getBoundingClientRect();
    if (r && r.width > 50 && r.height > 50) return { x: r.left, y: r.top, w: r.width, h: r.height };
    return { x: 0, y: 104, w: Math.max(400, window.innerWidth - 264), h: Math.max(300, window.innerHeight - 160) };
  };
  const geo = () => {
    const a = area();
    if (w.state === 'max') return { x: 0, y: 0, w: a.w, h: a.h };
    if (w.state === 'snapL') return { x: 0, y: 0, w: Math.round(a.w / 2), h: a.h };
    if (w.state === 'snapR') return { x: Math.round(a.w / 2), y: 0, w: Math.round(a.w / 2), h: a.h };
    return { x: Math.min(Math.max(0, w.x), Math.max(0, a.w - 160)), y: Math.min(Math.max(0, w.y), Math.max(0, a.h - 60)), w: Math.min(w.w, a.w), h: Math.min(w.h, a.h) };
  };
  const g = live || geo();

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    wsApi.winFocus(w.id);
    const a = area();
    let base = geo();
    // Pulling a maximised or snapped window off the edge restores its normal size under the pointer.
    if (w.state !== 'normal') {
      const ratio = (e.clientX - a.x - base.x) / base.w;
      base = { w: w.w, h: w.h, y: 0, x: Math.round(e.clientX - a.x - w.w * ratio) };
    }
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      setLive({ ...base, x: base.x + dx, y: Math.max(0, base.y + dy) });
      setSnap(snapFor(ev.clientX - a.x, ev.clientY - a.y, a));
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      const s = snapFor(ev.clientX - a.x, ev.clientY - a.y, a);
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (s) wsApi.winPatch(w.id, { state: s, prev: undefined, ...(w.state === 'normal' ? {} : { x: base.x, y: base.y }) });
      else wsApi.winPatch(w.id, { state: 'normal', x: base.x + dx, y: Math.max(0, base.y + dy) });
      setLive(null); setSnap(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const startResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    wsApi.winFocus(w.id);
    const base = geo();
    const sx = e.clientX, sy = e.clientY;
    const rtl = document.documentElement.dir === 'rtl';
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const width = Math.max(340, rtl ? base.w - dx : base.w + dx);
      setLive({ ...base, x: rtl ? base.x + (base.w - width) : base.x, w: width, h: Math.max(260, base.h + dy) });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const width = Math.max(340, rtl ? base.w - dx : base.w + dx);
      wsApi.winPatch(w.id, { state: 'normal', x: rtl ? base.x + (base.w - width) : base.x, y: base.y, w: width, h: Math.max(260, base.h + dy) });
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const winNav = useMemo(() => (name, id, tab, opts = {}) => {
    const m = clickModifiers();
    if (opts.newTab || opts.window || m.newTab || m.window) app.nav(name, id, tab, { newTab: opts.newTab || m.newTab, window: opts.window || m.window });
    else wsApi.winNav(w.id, { name, id, tab });
  }, [w.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const Screen = SCREENS[w.route.name] || CashScreen;
  if (w.state === 'min') return null;
  return (
    <>
      {snap && <div className={`snap-ghost snap-${snap}`} />}
      <section ref={ref} className={`win accent-${w.accent} ${top ? 'top' : ''} ${live ? 'moving' : ''} st-${w.state}`} style={{ left: g.x, top: g.y, width: g.w, height: g.h, zIndex: 30 + w.z }}
        onPointerDown={() => !top && wsApi.winFocus(w.id)} role="dialog" aria-label={routeLabel(w.route, t, names)}>
        <header className="win-head" onPointerDown={startDrag} onDoubleClick={(e) => !e.target.closest('button') && wsApi.winToggle(w.id, 'max')}>
          <span className="win-dot" />
          {w.back?.length > 0 && <IconButton icon="back" label={t('ws.back')} onClick={() => wsApi.winBack(w.id)} className="flip-rtl" />}
          <Icon name={ROUTE_ICON[w.route.name] || 'file'} size={15} />
          <span className="win-title">{routeLabel(w.route, t, names)}</span>
          <span className="win-tools">
            <IconButton icon="dock" label={t('ws.dock')} onClick={() => wsApi.winDock(w.id)} />
            <IconButton icon="minus" label={t('ws.minimize')} onClick={() => wsApi.winToggle(w.id, 'min')} />
            <IconButton icon={w.state === 'max' ? 'restore' : 'maximize'} label={t(w.state === 'max' ? 'ws.restore' : 'ws.maximize')} onClick={() => wsApi.winToggle(w.id, 'max')} />
            <IconButton icon="close" label={t('close')} onClick={() => wsApi.winClose(w.id)} />
          </span>
        </header>
        <div className="win-body">
          <RouteScope route={w.route} nav={winNav} inWindow>
            <Screen key={routeKey(w.route)} />
          </RouteScope>
        </div>
        {STATES[w.state] && <span className="win-resize" onPointerDown={startResize} aria-hidden="true" />}
      </section>
    </>
  );
}

export function WindowLayer() {
  const { ws } = useApp();
  const areaRef = useRef(null);
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  // Measure again once the area is visible, so new windows get their real size.
  useEffect(() => { force((n) => n + 1); }, [ws.windows.length]);
  if (!ws.windows.length) return <div className="win-area empty" ref={areaRef} />;
  const topZ = Math.max(...ws.windows.filter((w) => w.state !== 'min').map((w) => w.z), 0);
  return (
    <div className="win-area" ref={areaRef}>
      {ws.windows.map((w) => <Win key={w.id} w={w} areaRef={areaRef} top={w.z === topZ} />)}
    </div>
  );
}

export function Taskbar() {
  const { ws, wsApi, t, names } = useApp();
  if (!ws.windows.length) return null;
  const topZ = Math.max(...ws.windows.filter((w) => w.state !== 'min').map((w) => w.z), 0);
  return (
    <div className="taskbar" role="toolbar" aria-label={t('ws.windows')}>
      {ws.windows.map((w) => {
        const isTop = w.state !== 'min' && w.z === topZ;
        return (
          <button type="button" key={w.id} className={`task accent-${w.accent} ${w.state === 'min' ? 'is-min' : ''} ${isTop ? 'on' : ''}`}
            onClick={() => (w.state === 'min' ? (wsApi.winToggle(w.id, 'min'), wsApi.winFocus(w.id)) : isTop ? wsApi.winToggle(w.id, 'min') : wsApi.winFocus(w.id))}
            onAuxClick={(e) => e.button === 1 && wsApi.winClose(w.id)} title={routeLabel(w.route, t, names)}>
            <span className="win-dot" /><Icon name={ROUTE_ICON[w.route.name] || 'file'} size={15} /><span>{routeLabel(w.route, t, names)}</span>
          </button>
        );
      })}
      <span className="task-hint muted small">{t('ws.hint')}</span>
    </div>
  );
}

