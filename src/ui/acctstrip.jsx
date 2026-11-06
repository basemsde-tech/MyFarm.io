// Sub-tabs for open accounts inside Sales, Suppliers and Managers & funders:
// [ Customers ] [● Abu Fadi × ] [● Hanan's Shop × ] … Each account keeps a colour of its own,
// picked at random from the ones not in use. The list is kept per farm on this device.
import React, { useEffect, useState } from 'react';
import { useApp } from './store.jsx';
import { Icon } from './kit.jsx';
import { openSub } from './substrip.mjs';

const KEY = 'mazraati-subtabs-v1';
const HOME = { sales: { label: 'sales.customers', tab: 'customers', icon: 'people' }, suppliers: { label: 'sup.title', tab: null, icon: 'truck' }, people: { label: 'ppl.title', tab: null, icon: 'people' } };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: kept for this visit */ } };

export function AccountStrip({ list }) {
  const { t, nav, route, farmId, names, farm } = useApp();
  const [all, setAll] = useState(read);
  const mine = (all[farmId] && all[farmId][list]) || [];
  const listOf = { sales: farm.customers, suppliers: farm.suppliers, people: farm.people }[list] || [];
  const exists = (id) => listOf.some((x) => x.id === id);
  const tabs = mine.filter((x) => exists(x.id));
  const save = (next) => setAll((cur) => { const v = { ...cur, [farmId]: { ...(cur[farmId] || {}), [list]: next } }; write(v); return v; });
  // Opening an account adds it to the strip.
  useEffect(() => {
    if (route.name === list && route.id && exists(route.id) && !mine.some((x) => x.id === route.id)) save(openSub(tabs, route.id));
  }, [route.name, route.id, farmId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tabs.length) return null;
  const home = HOME[list];
  const label = (id) => (list === 'sales' ? names.customer(id) : list === 'suppliers' ? names.supplier(id) : names.person(id));
  const close = (id) => {
    const i = tabs.findIndex((x) => x.id === id);
    const rest = tabs.filter((x) => x.id !== id);
    save(rest);
    if (route.id === id) {
      const to = rest[Math.min(i, rest.length - 1)];
      if (to) nav(list, to.id); else nav(list, null, home.tab);
    }
  };
  const go = (id) => (id ? nav(list, id) : nav(list, null, home.tab));
  return (
    <nav className="sub-strip" aria-label={t('st.open')}>
      <div className="sub-strip-in" role="tablist">
        <button type="button" role="tab" aria-selected={!route.id} className={`sub-tab home ${!route.id ? 'on' : ''}`} onClick={() => go(null)}>
          <Icon name={home.icon} size={14} /><span>{t(home.label)}</span>
        </button>
        {tabs.map((x) => (
          <div key={x.id} role="tab" tabIndex={0} aria-selected={route.id === x.id} className={`sub-tab st-c${x.c} ${route.id === x.id ? 'on' : ''}`} data-ctx="party" data-list={list} data-id={x.id}
            onClick={() => go(x.id)} onKeyDown={(e) => { if (e.key === 'Enter') go(x.id); if (e.key === 'Delete') close(x.id); }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); close(x.id); } }} title={label(x.id)}>
            <span className="sub-dot" />
            <span className="sub-label">{label(x.id)}</span>
            <button type="button" className="sub-x" aria-label={`${t('cm.closeTab')} · ${label(x.id)}`} onClick={(e) => { e.stopPropagation(); close(x.id); }}><Icon name="close" size={12} /></button>
          </div>
        ))}
        {tabs.length > 1 && <button type="button" className="sub-clear" onClick={() => { save(route.id ? tabs.filter((x) => x.id === route.id) : []); }} title={t('st.closeAll')}>{t('st.closeAll')}</button>}
      </div>
    </nav>
  );
}
