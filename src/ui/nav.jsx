// Navigation: a side rail on desktop and tablet, a floating dock on phones.
// One highlight glides between items; live badges show what needs attention.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './store.jsx';
import { Icon } from './kit.jsx';
import { useOverdue } from './reminders.jsx';
import { orderList } from '../core/orders.mjs';
import { expiringDocs } from '../core/documents.mjs';
import { can } from '../core/catalog.mjs';

export const NAV = [
  { group: 'grp.cash', items: [['cash', 'cash'], ['people', 'people']] },
  { group: 'grp.farm', items: [['animals', 'cow'], ['production', 'milk'], ['expenses', 'receipt'], ['suppliers', 'truck']] },
  { group: 'grp.office', items: [['sales', 'cart'], ['accounts', 'ledger'], ['reports', 'chart'], ['options', 'gear'], ['guide', 'help'], ['trash', 'trash']] },
];
// The sidebar shows the daily pages; the rest sit in a folding "More" (opens by itself on one of its pages).
const SIDE_MAIN = [['cash', 'cash'], ['sales', 'cart'], ['production', 'milk'], ['animals', 'cow'], ['expenses', 'receipt'], ['suppliers', 'truck']];
const SIDE_MORE = [['accounts', 'ledger'], ['reports', 'chart'], ['people', 'people'], ['options', 'gear'], ['guide', 'help'], ['trash', 'trash']];
export const navLabel = (k) => (k === 'options' ? 'nav.settings' : `nav.${k}`);
const DOCK = [['cash', 'cash'], ['sales', 'cart'], null, ['production', 'milk'], ['animals', 'cow']];

/** What needs attention, per page: { count, tone, hint }. */
function useBadges() {
  const { farm, today, t } = useApp();
  const overdue = useOverdue();
  return useMemo(() => {
    const b = {};
    if (overdue.length) b.sales = { n: overdue.length, tone: 'warn', hint: t('nb.overdue', { n: overdue.length }) };
    const open = orderList(farm).filter((o) => o.status === 'open' || o.status === 'partial');
    if (open.length) b.suppliers = { n: open.length, tone: open.some((o) => o.late) ? 'warn' : 'info', hint: t('nb.orders', { n: open.length }) };
    const docs = expiringDocs(farm, today);
    if (docs.length) b.options = { n: docs.length, tone: docs.some((d) => d.state === 'expired') ? 'bad' : 'warn', hint: t('nb.docs', { n: docs.length }) };
    const trash = farm.records.filter((r) => r.deletedAt && r.deleteReason !== 'replaced').length;
    if (trash) b.trash = { n: trash, tone: 'quiet' };
    return b;
  }, [farm, overdue, today, t]);
}

const Badge = ({ b }) => (b ? <span className={`nb nb-${b.tone}`} key={b.n}>{b.n > 99 ? '99+' : b.n}</span> : null);

/** Keeps an absolutely-placed highlight on the active child of `ref`. */
function useGlide(ref, selector, deps) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return undefined;
    const measure = () => {
      const el = host.querySelector(selector);
      if (!el || !el.offsetParent) { setBox(null); return; }
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    return () => ro?.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

export function SideNav({ go, nav }) {
  const { t, route, actor, prefs, setPrefs } = useApp();
  const badges = useBadges();
  const ref = useRef(null);
  const closed = prefs.navClosed || {};
  const groups = [{ group: 'main', items: SIDE_MAIN, plain: true }, { group: 'more', items: SIDE_MORE, more: true }];
  // "More" starts folded; it stays open once opened, and always opens on one of its own pages.
  const isFolded = (g) => (g.more ? closed.more !== false : !!closed[g.group]);
  const box = useGlide(ref, '.nav-item.on', [route.name, prefs.rail, JSON.stringify(closed)]);
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(id); }, []);
  const toggle = (g) => setPrefs({ navClosed: { ...closed, [g.group]: !isFolded(g) } });
  const onKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = [...ref.current.querySelectorAll('.nav-item')].filter((x) => x.offsetParent);
    const i = items.indexOf(document.activeElement);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[j]?.focus(); e.preventDefault();
  };
  return (
    <nav ref={ref} className={`side-nav ${ready ? 'ready' : ''}`} onKeyDown={onKey}>
      {box && <span className="nav-glide" aria-hidden="true" style={{ transform: `translateY(${box.y}px)`, blockSize: `${box.h}px` }} />}
      {groups.map((g) => {
        const isClosed = !g.plain && isFolded(g) && !g.items.some(([k]) => k === route.name);
        const hidden = isClosed ? g.items.reduce((s, [k]) => s + (badges[k] && badges[k].tone !== 'quiet' ? badges[k].n : 0), 0) : 0;
        return (
          <div className={`nav-group ${g.more ? 'more-group' : ''} ${g.plain ? 'plain' : ''} ${isClosed ? 'closed' : ''}`} key={g.group}>
            {g.more && (
              <button type="button" className="nav-group-label nav-more" onClick={() => toggle(g)} aria-expanded={!isClosed} title={t('nav.more')} data-tip={t('nav.more')}>
                <Icon name="more" size={17} /><span>{t('nav.more')}</span>{hidden > 0 && <i className="nb-dot" />}<Icon name="down" size={13} className="ngl-chev" />
              </button>
            )}
            <div className="nav-group-body"><div>
              {g.items.map(([k, ic]) => {
                const b = badges[k];
                return (
                  <button type="button" key={k} title={b?.hint || t(navLabel(k))} data-tip={t(navLabel(k))} className={`nav-item ${route.name === k ? 'on' : ''}`} tabIndex={isClosed ? -1 : 0}
                    onClick={() => go(k)} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); nav(k, null, null, { newTab: true }); } }} aria-current={route.name === k ? 'page' : undefined}>
                    <Icon name={ic} /><span className="ni-label">{t(navLabel(k))}</span><Badge b={b} />
                  </button>
                );
              })}
            </div></div>
          </div>
        );
      })}
    </nav>
  );
}

/** Phone dock: four main pages, the + in the middle, and More. Slides away while scrolling down. */
export function Dock({ go, onNew, more, setMore }) {
  const { t, route } = useApp();
  const badges = useBadges();
  const ref = useRef(null);
  const [hide, setHide] = useState(false);
  const inDock = DOCK.some((d) => d && d[0] === route.name);
  const box = useGlide(ref, more ? '.dock-btn.more' : '.dock-btn.on', [route.name, more]);
  useEffect(() => {
    let y = window.scrollY; let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const now = window.scrollY; const d = now - y;
        if (Math.abs(d) > 6) { setHide(d > 0 && now > 120); y = now; }
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setHide(false); }, [route.name]);
  const otherBadges = Object.entries(badges).filter(([k, b]) => !DOCK.some((d) => d && d[0] === k) && b.tone !== 'quiet').length;
  return (
    <nav className={`dock ${hide && !more ? 'tucked' : ''}`} aria-label={t('nav.more')}>
      <div className="dock-bar" ref={ref}>
        {box && <span className="dock-glide" aria-hidden="true" style={{ transform: `translateX(${box.x}px)`, inlineSize: `${box.w}px` }} />}
        {DOCK.map((d) => (d ? (
          <button type="button" key={d[0]} className={`dock-btn ${route.name === d[0] && !more ? 'on' : ''}`} onClick={() => go(d[0])} aria-current={route.name === d[0] ? 'page' : undefined}>
            <span className="db-ico"><Icon name={d[1]} /><Badge b={badges[d[0]]} /></span><span className="db-label">{t(`dock.${d[0]}`)}</span>
          </button>
        ) : (
          <button type="button" key="new" className="dock-plus" onClick={onNew} aria-label={t('new')}><Icon name="plus" size={26} /></button>
        )))}
        <button type="button" className={`dock-btn more ${more || !inDock ? 'on' : ''}`} onClick={() => setMore(!more)} aria-expanded={more}>
          <span className="db-ico"><Icon name={more ? 'close' : 'menu'} />{otherBadges > 0 && !more && <i className="nb-dot" />}</span><span className="db-label">{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  );
}

/** Everything else, grouped, with a quick filter. */
export function MoreSheet({ go, onClose, onSwitch }) {
  const { t, route, actor } = useApp();
  const badges = useBadges();
  const [q, setQ] = useState('');
  const [leaving, setLeaving] = useState(false);
  const close = () => { setLeaving(true); setTimeout(onClose, 200); };
  const pick = (k) => { setLeaving(true); setTimeout(() => go(k), 120); };
  const needle = q.trim().toLowerCase();
  let i = 0;
  return (
    <div className={`scrim more-scrim ${leaving ? 'leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="more-sheet" role="dialog" aria-label={t('nav.more')}>
        <div className="ms-handle" aria-hidden="true" />
        <label className="ms-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('nb.find')} /></label>
        {NAV.map((g) => {
          const items = g.items.filter(([k]) => (k !== 'activity' || can(actor?.role, 'settings')) && (!needle || t(navLabel(k)).toLowerCase().includes(needle)));
          if (!items.length) return null;
          return (
            <section key={g.group} className="ms-group">
              <h3>{t(g.group)}</h3>
              <div className="ms-grid">
                {items.map(([k, ic]) => (
                  <button type="button" key={k} className={`ms-tile ${route.name === k ? 'on' : ''}`} style={{ '--i': i++ }} onClick={() => pick(k)}>
                    <span className="db-ico"><Icon name={ic} /><Badge b={badges[k]} /></span><span>{t(navLabel(k))}</span>
                    {badges[k]?.hint && <small>{badges[k].hint}</small>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        <button type="button" className="ms-switch" onClick={onSwitch}><Icon name="logout" size={16} />{t('pf.logOff')}</button>
      </div>
    </div>
  );
}
