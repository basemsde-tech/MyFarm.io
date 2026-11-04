// Right-click menu: quick actions for what was clicked (a record, a customer / supplier / person card,
// a tab, or the page). Text fields and selected text keep the browser's own menu; Shift + right-click too.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './store.jsx';
import { Icon } from './kit.jsx';
import { can } from '../core/catalog.mjs';
import { isMoney } from '../core/commands.mjs';
import { describe } from './tx.jsx';
import { useRefresh } from './refresh.jsx';
import { routeLabel } from './workspace.jsx';

const ACCOUNT = { sales: 'customer', suppliers: 'supplier', people: 'person' };

/** What the click landed on. */
function targetOf(el) {
  const hit = el?.closest?.('[data-ctx]');
  if (!hit) return { kind: 'page' };
  return { kind: hit.getAttribute('data-ctx'), id: hit.getAttribute('data-id'), list: hit.getAttribute('data-list') };
}
const nativeOnly = (e) => {
  if (e.shiftKey) return true;
  const el = e.target;
  if (el?.closest?.('input, textarea, select, [contenteditable="true"], .sheet, .modal, [role="dialog"], .print-doc')) return true;
  const sel = typeof window !== 'undefined' ? String(window.getSelection?.() || '') : '';
  return sel.trim().length > 0;
};
const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;

export function ContextMenu() {
  const app = useApp();
  const { t, ui, nav, route, wsApi, ws, farm, actor, fmt, names, refreshView, toast } = app;
  const appRefresh = useRefresh();
  const [m, setM] = useState(null); // { x, y, target }
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const on = (e) => {
      if (touchOnly() || nativeOnly(e)) return;
      e.preventDefault();
      setPos(null);
      setM({ x: e.clientX, y: e.clientY, target: targetOf(e.target) });
    };
    document.addEventListener('contextmenu', on);
    return () => document.removeEventListener('contextmenu', on);
  }, []);
  useEffect(() => {
    if (!m) return undefined;
    const close = () => setM(null);
    const opened = Date.now();
    // A scroll still settling right after the click should not close the menu.
    const onScroll = (e) => { if (Date.now() - opened > 250 && !box.current?.contains(e.target)) close(); };
    const down = (e) => { if (!box.current?.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      const items = [...(box.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', close);
    };
  }, [m]);
  // Keep the menu on screen.
  useLayoutEffect(() => {
    if (!m || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(m.x, window.innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(m.y, window.innerHeight - r.height - 8));
    setPos({ x, y });
    box.current.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [m]);
  if (!m) return appRefresh.overlay;

  const close = () => setM(null);
  const run = (fn) => () => { close(); setTimeout(fn, 0); };
  const refresh = async () => { await refreshView(); toast(t('cm.refreshed'), { tone: 'good', ms: 1800 }); };
  const groups = [];
  const { target } = m;
  const canWin = wsApi.canWindow();
  const openRoute = (r) => [
    { icon: 'chev', label: t('cm.open'), fn: () => nav(r.name, r.id, r.tab, { newTab: false }) },
    { icon: 'plus', label: t('cm.newTab'), fn: () => nav(r.name, r.id, r.tab, { newTab: true }) },
    canWin && { icon: 'popout', label: t('cm.window'), fn: () => wsApi.openWindow({ name: r.name, id: r.id, tab: r.tab || null }) },
  ];
  const accountActions = (list, id) => {
    const out = [];
    if (list === 'sales') out.push({ icon: 'cart', label: t('cust.newSale'), fn: () => ui.open('sale', { customerId: id }) }, { icon: 'cash', label: t('cust.takePayment'), fn: () => ui.open('payment', { customerId: id }) });
    if (list === 'suppliers') out.push({ icon: 'receipt', label: t('sup.bill'), fn: () => ui.open('expense', { supplierId: id }) }, { icon: 'truck', label: t('sup.pay'), fn: () => ui.open('supplierPay', { supplierId: id }) });
    if (list === 'people') out.push({ icon: 'plus', label: t('ppl.what'), fn: () => ui.open('capital', { personId: id }) });
    if (ACCOUNT[list]) out.push({ icon: 'file', label: t('cust.statement'), fn: () => ui.open('doc', { kind: 'statement', party: ACCOUNT[list], partyId: id }) });
    const rec = list === 'sales' ? farm.customers.find((x) => x.id === id) : list === 'suppliers' ? farm.suppliers.find((x) => x.id === id) : list === 'people' ? farm.people.find((x) => x.id === id) : farm.animals.find((x) => x.id === id);
    const sheet = { sales: 'customer', suppliers: 'supplier', people: 'person', animals: 'animal' }[list];
    if (rec && sheet) out.push({ icon: 'edit', label: t('edit'), fn: () => ui.open(sheet, { record: rec }) });
    return out;
  };

  if (target.kind === 'record') {
    const r = farm.records.find((x) => x.id === target.id);
    if (r) {
      const d = describe(r, app);
      const money = isMoney(r);
      const canEdit = !r.deletedAt && !r.voided && (!money || can(actor?.role, 'money.edit'));
      const canDel = !r.deletedAt && (!money || can(actor?.role, 'money.delete'));
      groups.push({ head: `${d.kind} · ${d.title}`, items: [
        { icon: 'file', label: t('cm.openRecord'), fn: () => ui.open('drawer', { id: r.id }) },
        canEdit && { icon: 'edit', label: t('edit'), fn: () => ui.open(r.type, { record: r }) },
        r.type === 'sale' && { icon: 'print', label: r.customerId ? t('sale.invoice') : t('sale.receipt'), fn: () => ui.open('doc', { kind: r.customerId ? 'invoice' : 'receipt', id: r.id }) },
        r.type === 'payment' && { icon: 'print', label: t('sale.receipt'), fn: () => ui.open('doc', { kind: 'paymentReceipt', id: r.id }) },
        d.amountC != null && { icon: 'list', label: t('cm.copyAmount'), fn: async () => { try { await navigator.clipboard.writeText(fmt(d.amountC)); toast(t('copied'), { tone: 'good', ms: 1500 }); } catch { /* clipboard blocked */ } } },
        { icon: 'refresh', label: t('cm.refreshRecord'), fn: async () => { await refreshView(); ui.open('drawer', { id: r.id }); } },
      ] });
      const party = r.customerId ? ['sales', r.customerId] : r.supplierId ? ['suppliers', r.supplierId] : r.personId ? ['people', r.personId] : null;
      if (party) groups.push({ head: entity(party, names), items: openRoute({ name: party[0], id: party[1] }) });
      if (canDel) groups.push({ items: [{ icon: 'trash', label: t('delete'), danger: true, fn: () => ui.open('delete', { ids: [r.id] }) }] });
    }
  } else if (target.kind === 'party') {
    const r = { name: target.list, id: target.id };
    groups.push({ head: entity([target.list, target.id], names), items: openRoute(r) });
    const acts = accountActions(target.list, target.id);
    if (acts.length) groups.push({ items: acts });
  } else if (target.kind === 'tab') {
    const tab = ws.tabs.find((x) => x.id === target.id);
    if (tab) {
      groups.push({ head: routeLabel(tab.route, t, names), items: [
        { icon: 'refresh', label: t('cm.refreshTab'), fn: () => { wsApi.activate(tab.id); refresh(); } },
        { icon: 'plus', label: t('cm.duplicate'), fn: () => wsApi.duplicate(tab.id) },
        ws.tabs.length > 1 && { icon: 'back', flip: true, label: t('cm.moveLeft'), disabled: ws.tabs[0].id === tab.id, fn: () => wsApi.moveTab(tab.id, ws.tabs.findIndex((x) => x.id === tab.id) - 1) },
        ws.tabs.length > 1 && { icon: 'chev', flip: true, label: t('cm.moveRight'), disabled: ws.tabs[ws.tabs.length - 1].id === tab.id, fn: () => wsApi.moveTab(tab.id, ws.tabs.findIndex((x) => x.id === tab.id) + 1) },
        canWin && { icon: 'popout', label: t('cm.window'), fn: () => wsApi.openWindow(tab.route) },
        ws.tabs.length > 1 && { icon: 'close', label: t('cm.closeTab'), fn: () => wsApi.closeTab(tab.id) },
        ws.tabs.length > 1 && { icon: 'close', label: t('cm.closeOthers'), fn: () => wsApi.closeOthers(tab.id) },
      ] });
    }
  }
  // The page itself, always last.
  const cur = ws.tabs.find((x) => x.id === ws.active);
  if (route.id && ACCOUNT[route.name] && target.kind === 'page') {
    groups.push({ head: entity([route.name, route.id], names), items: accountActions(route.name, route.id) });
  }
  groups.push({ head: target.kind === 'page' ? routeLabel(route, t, names) : t('cm.page'), items: [
    { icon: 'refresh', label: t('cm.refresh'), fn: refresh },
    { icon: 'back', label: t('ws.back'), fn: wsApi.back, disabled: !cur?.back.length, flip: true },
    { icon: 'chev', label: t('ws.forward'), fn: wsApi.forward, disabled: !cur?.fwd.length, flip: true },
    target.kind === 'page' && { icon: 'plus', label: t('cm.pageNewTab'), fn: () => nav(route.name, route.id, route.tab, { newTab: true }) },
    target.kind === 'page' && canWin && { icon: 'popout', label: t('cm.window'), fn: () => wsApi.openWindow(route) },
    { icon: 'search', label: t('cm.search'), hint: 'Ctrl K', fn: () => ui.open('palette') },
    { icon: 'plus', label: t('cm.new'), hint: 'N', fn: () => ui.open('new') },
  ] });
  groups.push({ items: [{ icon: 'refresh', label: t('rf.title'), fn: appRefresh.run }] });

  const list = groups.map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length);
  return createPortal(
    <>
      <div ref={box} className="ctx-menu" role="menu" aria-label={t('cm.title')} style={{ left: (pos || m).x, top: (pos || m).y, visibility: pos ? 'visible' : 'hidden' }}
        onContextMenu={(e) => { e.preventDefault(); close(); }}>
        {list.map((g, gi) => (
          <div className="ctx-group" key={gi}>
            {g.head && <div className="ctx-head">{g.head}</div>}
            {g.items.map((it, i) => (
              <button type="button" role="menuitem" key={i} className={`ctx-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} onClick={run(it.fn)}>
                <Icon name={it.icon} size={15} className={it.flip ? 'flip-rtl' : ''} /><span>{it.label}</span>{it.hint && <kbd>{it.hint}</kbd>}
              </button>
            ))}
          </div>
        ))}
      </div>
      {appRefresh.overlay}
    </>, document.body);
}

function entity([list, id], names) {
  if (list === 'sales') return names.customer(id);
  if (list === 'suppliers') return names.supplier(id);
  if (list === 'people') return names.person(id);
  if (list === 'animals') return names.animal(id);
  return '';
}
