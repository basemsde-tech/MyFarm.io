import React, { useMemo, useState } from 'react';
import { milkQ, milkN } from './units.js';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Tabs, Seg, Grouped, Select, DateInput, monthLabel, dayLabel, IconButton, useCountUp, Sparkline, FilterPanel } from './kit.jsx';
import { InvoiceRegister } from './screens-accounts.jsx';
import { Help } from './help.jsx';
const GUIDE_FOR = { cash: 'cash', sales: 'sales', expenses: 'expenses', suppliers: 'suppliers', production: 'production', animals: 'animals', accounts: 'accounts', options: 'security', trash: 'edit', activity: 'security', people: 'payments' };
import { RemindersPanel, useOverdue } from './reminders.jsx';
import { OrdersList } from './orders.jsx';
import { Attachments } from './documents.jsx';
import { orderList, poNo } from '../core/orders.mjs';
import { expiringDocs } from '../core/documents.mjs';
import { RecordRow, SelectionBar, describe } from './tx.jsx';
import { customerInvoices, supplierBills, live } from '../core/ledger.mjs';
import { partyLines } from '../core/statement.mjs';
import { periodRange } from '../core/statement.mjs';
import { upsert, addRecord, editRecord } from '../core/commands.mjs';
import { toCSV } from '../core/reports.mjs';

import { daysBetween, addDays, SPECIES } from '../core/species.mjs';
import { EXPENSE_GROUPS, groupOf, CATEGORY_ICON } from '../core/catalog.mjs';

export function downloadText(name, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function PageHead({ title, actions, back, sub }) {
  const { t, route } = useApp();
  return (
    <header className="page-head">
      <div className="page-title">
        {back && <IconButton icon="back" label={t('back')} onClick={back} className="flip-rtl" />}
        <div><h1>{title}{!route.id && <Help k={`page.${route.name}`} more={GUIDE_FOR[route.name]} />}</h1>{sub && <div className="page-sub">{sub}</div>}</div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function PeriodBar({ value, onChange, range, setRange, options = ['today', 'week', 'month', 'lastMonth', 'year', 'all', 'custom'] }) {
  const { t } = useApp();
  return (
    <div className="period-bar">
      <Seg small wrap value={value} onChange={onChange} options={options.map((p) => ({ value: p, label: t(`p.${p}`) }))} />
      {value === 'custom' && (
        <div className="grid2 tight">
          <DateInput label={t('from')} value={range.from} onChange={(v) => setRange({ ...range, from: v })} />
          <DateInput label={t('to')} value={range.to} onChange={(v) => setRange({ ...range, to: v })} />
        </div>
      )}
    </div>
  );
}
export function usePeriod(initial = 'month') {
  const { today } = useApp();
  const [p, setP] = useState(initial);
  const [range, setRange] = useState(periodRange(initial, today));
  const onChange = (v) => { setP(v); if (v !== 'custom') setRange(periodRange(v, today)); };
  const { t, lang } = useApp();
  const label = p === 'custom' ? `${dayLabel(range.from, lang)} – ${dayLabel(range.to, lang)}` : t(`p.${p}`);
  return { p, range, setRange, onChange, label, isDefault: p === initial, reset: () => onChange(initial) };
}

/** Everything that needs a look today. */
export function useAttention() {
  const { farm, snap, today, t, fmt } = useApp();
  return useMemo(() => {
    const out = [];
    const terms = farm.settings.termsDays ?? 30;
    let overdueCust = 0;
    for (const c of farm.customers) {
      if (!snap.cust[c.id]?.dueC) continue;
      if (customerInvoices(farm, c.id, snap, { today, termsDays: terms }).some((i) => i.status === 'overdue')) overdueCust++;
    }
    if (overdueCust) out.push({ key: `custDue:${overdueCust}`, icon: 'cart', tone: 'bad', text: t('att.custDue', { n: overdueCust }), go: ['sales', null, 'reminders'] });
    let supOver = 0;
    for (const s of farm.suppliers) supOver += supplierBills(farm, s.id, { today }).bills.filter((b) => b.status === 'overdue').length;
    if (supOver) out.push({ key: `supOver:${supOver}`, icon: 'truck', tone: 'bad', text: t('att.supOverdue', { n: supOver }), go: ['suppliers'] });
    for (const o of farm.obligations) {
      if (o.archived || !o.nextDue) continue;
      const d = daysBetween(today, o.nextDue);
      if (d <= 3) out.push({ key: `obl:${o.id}:${o.nextDue}`, icon: 'calendar', tone: d < 0 ? 'bad' : 'warn', text: `${t('att.obligation', { name: o.party })} · ${d < 0 ? t('obl.overdue', { n: -d }) : d === 0 ? t('obl.dueToday') : t('obl.dueIn', { n: d })}`, go: ['expenses', null, 'obligations'] });
    }
    const old = snap.milk.lots.filter((l) => l.fresh === 'old');
    if (old.length) out.push({ key: `milkOld:${old.map((l) => l.key).join(',')}`, icon: 'milk', tone: 'warn', text: t('att.lowTank', { l: `${milkQ(old.reduce((s, l) => s + l.left, 0))}` }), go: ['production', null, 'milk'] });
    const milkers = farm.animals.some((a) => SPECIES[a.species]?.product === 'milk' && !['sold', 'dead'].includes(a.status));
    if (milkers && !farm.records.some((r) => r.type === 'milk' && r.day === today && !r.deletedAt) && new Date().getHours() >= 10) out.push({ key: `noMilk:${today}`, icon: 'milk', tone: 'info', text: t('att.noMilk'), go: ['production', null, 'milk'], action: 'milk' });
    const openBills = farm.records.filter((r) => live(r) && r.type === 'expense' && !r.supplierId && r.source !== 'person' && (r.paidC || 0) < r.amountC);
    if (openBills.length) out.push({ key: `openBills:${openBills.length}:${snap.payablesC}`, icon: 'receipt', tone: 'warn', text: `${t('att.openBills', { n: openBills.length })} · ${fmt(snap.payablesC)}`, go: ['expenses', null, 'open'] });
    const lateOrders = orderList(farm).filter((o) => o.late).length;
    if (lateOrders) out.push({ key: `lateOrders:${lateOrders}`, icon: 'truck', tone: 'warn', text: t('att.lateOrders', { n: lateOrders }), go: ['suppliers', null, 'orders'] });
    const docs = expiringDocs(farm, today);
    if (docs.length) out.push({ key: `docs:${docs.map((d) => d.id + d.state).join(',')}`, icon: 'file', tone: docs.some((d) => d.state === 'expired') ? 'bad' : 'warn', text: t('att.docs', { n: docs.length, d: docs[0].title }), go: docs[0].owner.list === 'animals' ? ['animals', docs[0].owner.id] : docs[0].owner.list === 'customers' ? ['sales', docs[0].owner.id] : docs[0].owner.list === 'orders' ? ['suppliers', null, 'orders'] : [docs[0].owner.list, docs[0].owner.id] });
    return out;
  }, [farm, snap, today, t, fmt]);
}

/* ───────────── Cash box ───────────── */
const FLOW_LABEL = { sale: 'kind.sale', payment: 'kind.payment', expense: 'kind.expense', supplierPay: 'kind.supplierPay', capitalIn: 'kind.capitalIn', capitalOut: 'kind.capitalOut', personal: 'kind.personal' };

/** The big cash figure counts up on its own, so the rest of the page is not redrawn every frame. */
function CountUpMoney({ value }) {
  const { fmt } = useApp();
  const shown = useCountUp(value);
  return <div className="cash-big num" aria-live="polite">{fmt(shown)}</div>;
}

export function CashScreen() {
  const app = useApp();
  const { farm, snap, t, fmt, today, ui, nav, lang } = app;
  const per = usePeriod('month');
  const [dir, setDir] = useState('all');
  const account = 'cash';
  const [kind, setKind] = useState('');
  const [sel, setSel] = useState([]);
  const att = useAttention();
  const todayFlows = snap.flows.filter((f) => f.day === today && f.account === 'cash');
  const todayIn = todayFlows.filter((f) => f.dir > 0).reduce((s, f) => s + f.amountC, 0);
  const todayOut = todayFlows.filter((f) => f.dir < 0).reduce((s, f) => s + f.amountC, 0);
  const rows = useMemo(() => {
    let bal = 0;
    const all = snap.flows.filter((f) => f.account === account).map((f) => { bal += f.dir * f.amountC; return { ...f, balC: bal }; });
    return all.filter((f) => f.day >= per.range.from && f.day <= per.range.to && (dir === 'all' || (dir === 'in' ? f.dir > 0 : f.dir < 0)) && (!kind || f.kind === kind)).reverse();
  }, [snap.flows, account, per.range, dir, kind]);
  const recById = useMemo(() => new Map(farm.records.map((r) => [r.id, r])), [farm.records]);
  const opening = useMemo(() => { let b = 0; for (const f of snap.flows) if (f.account === account && f.day < per.range.from) b += f.dir * f.amountC; return b; }, [snap.flows, per.range.from]);
  const inP = rows.filter((r) => r.dir > 0).reduce((s, r) => s + r.amountC, 0);
  const outP = rows.filter((r) => r.dir < 0).reduce((s, r) => s + r.amountC, 0);
  const milkToday = snap.milk.lots.filter((l) => l.day === today).reduce((s, l) => s + l.liters, 0);
  const trend = useMemo(() => {
    const byDay = new Map();
    let bal = 0;
    for (const f of snap.flows) if (f.account === 'cash') { bal += f.dir * f.amountC; byDay.set(f.day, bal); }
    const out = [];
    let last = 0;
    for (const [d, v] of byDay) if (d < addDays(today, -30)) last = v;
    for (let i = 30; i >= 0; i--) { const d = addDays(today, -i); if (byDay.has(d)) last = byDay.get(d); out.push(last); }
    return out;
  }, [snap.flows, today]);
  // The movement list is the heaviest part of the page: rebuild it only when its inputs change,
  // not on every toast or animation frame.
  const journalList = useMemo(() => (
    <Grouped rows={rows} groupKey={(r) => r.day.slice(0, 7)}
      renderGroup={(g) => <><span>{monthLabel(g.key, lang)}</span><span className="num muted">{fmt(g.rows.reduce((s, r) => s + r.dir * r.amountC, 0))}</span></>}
      renderRow={(f) => {
        const rec = recById.get(f.id);
        if (!rec) return null;
        return <RecordRow key={f.id + f.kind} r={rec} dir={f.dir} onOpen={() => ui.open('drawer', { id: f.id })} selectable selected={sel.includes(f.id)}
          onSelect={(on) => setSel((cur) => (on ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
          right={<span className="amt-stack"><span className={f.dir > 0 ? 'in' : 'out'}>{f.dir > 0 ? '+' : '−'}{fmt(f.amountC).replace('−', '')}</span><small className="muted">{fmt(f.balC)}</small></span>} />;
      }} />
  ), [rows, recById, sel, lang, fmt, farm.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const selTotal = rows.filter((r) => sel.includes(r.id)).reduce((s, r) => s + r.dir * r.amountC, 0);
  const exportCSV = () => downloadText(`cash-${per.range.from}-${per.range.to}.csv`, toCSV([
    [t('date'), t('details'), t('in'), t('out'), t('balance'), t('by')],
    ...[...rows].reverse().map((r) => { const rec = recById.get(r.id); const d = rec ? describe(rec, app) : {}; return [r.day, `${t(FLOW_LABEL[r.kind])} · ${d.title || ''}`, r.dir > 0 ? r.amountC / 100 : '', r.dir < 0 ? r.amountC / 100 : '', r.balC / 100, r.by]; }),
  ]));
  return (
    <div className="screen cash-layout">
      <div className="screen cash-col">
      <section className="cash-hero">
        <div className="cash-main">
          <div className="cash-label">{t('cash.inBox')} <Help k="page.cash" more="cash" /></div>
          <CountUpMoney value={snap.cashC} />
          <div className="cash-spark"><Sparkline points={trend} label={t('cash.trend')} /><span className="cash-spark-label">{t('cash.trend')}</span></div>
          <div className="cash-row">
            {snap.capitalC !== 0 && <span>{t('cash.capital')} <b className="num">{fmt(snap.capitalC)}</b></span>}
          </div>
        </div>
        <div className="cash-today">
          <Stat label={t('cash.todayIn')} value={todayIn ? `+${fmt(todayIn)}` : fmt(0)} tone="in" />
          <Stat label={t('cash.todayOut')} value={todayOut ? `−${fmt(todayOut)}` : fmt(0)} tone="out" />
          <Stat label={t('cash.owedToUs')} value={fmt(snap.receivableC)} onClick={() => nav('sales', null, 'customers')} />
          <Stat label={t('cash.weOweAll')} value={fmt(snap.supplierDueC + snap.payablesC)} sub={snap.payablesC && snap.supplierDueC ? `${t('nav.suppliers')} ${fmt(snap.supplierDueC)}` : null} onClick={() => nav('expenses', null, 'open')} />
        </div>
      </section>

      <div className="quick">
        <Button variant="primary" icon="cart" onClick={() => ui.open('sale')}>{t('new.sale')}</Button>
        <Button icon="cash" onClick={() => ui.open('payment')}>{t('new.payment')}</Button>
        <Button icon="receipt" onClick={() => ui.open('expense')}>{t('new.expense')}</Button>
        <Button icon="milk" onClick={() => ui.open('milk')}>{t('new.milk')}{milkToday > 0 && <span className="badge num">{milkN(milkToday)}</span>}</Button>
      </div>
      </div>

      <div className="cash-grid">
      <section className="panel attention">
        <h2>{t('cash.attention')} <Help k="attention" /></h2>
        {att.length ? (
          <ul className="att-list">
            {att.map((a, i) => (
              <li key={i}><button type="button" className={`att att-${a.tone}`} onClick={() => (a.action ? ui.open(a.action) : nav(...a.go))}><span className="att-dot" />{a.text}<Icon name="chev" size={16} className="flip-rtl" /></button></li>
            ))}
          </ul>
        ) : <p className="all-good"><Icon name="check" size={18} /> {t('cash.allGood')}</p>}
      </section>

      <section className="panel journal">
        <div className="panel-head">
          <h2>{t('cash.journal')}</h2>
          <div className="row-btns">
            <Button size="sm" icon="download" onClick={exportCSV}>{t('export')}</Button>
          </div>
        </div>
        <FilterPanel id="cash" onReset={() => { per.reset(); setDir('all'); setKind(''); }}
          chips={[{ label: per.label, active: !per.isDefault }, dir !== 'all' && { label: t(dir), active: true }, kind && { label: t(FLOW_LABEL[kind]), active: true }]}>
          <PeriodBar value={per.p} onChange={per.onChange} range={per.range} setRange={per.setRange} />
          <div className="filter-row">
            <Seg small label={t('flt.direction')} value={dir} onChange={setDir} options={[{ value: 'all', label: t('all') }, { value: 'in', label: t('in') }, { value: 'out', label: t('out') }]} />
            <Select className="compact" label={t('flt.kind')} value={kind} onChange={setKind} options={Object.keys(FLOW_LABEL).map((k) => ({ value: k, label: t(FLOW_LABEL[k]) }))} placeholder={t('all')} />
          </div>
        </FilterPanel>
        <div className="statement-strip num">
          <span>{t('cash.opening')} <b>{fmt(opening)}</b></span>
          <span className="in">+{fmt(inP)}</span>
          <span className="out">{outP ? `−${fmt(outP)}` : fmt(0)}</span>
          <span>{t('cash.closing')} <b>{fmt(opening + inP - outP)}</b></span>
        </div>
        {rows.length ? journalList : <Empty title={t('cash.empty')} body={t('cash.emptyHint')} icon="cash" action={<Button variant="primary" icon="cart" onClick={() => ui.open('sale')}>{t('new.sale')}</Button>} />}
      </section>
      </div>
      <SelectionBar selected={sel} clear={() => setSel([])} totalC={selTotal} />
    </div>
  );
}

/* ───────────── Sales ───────────── */
export function SalesScreen() {
  const { route, nav } = useApp();
  if (route.id) return <CustomerAccount id={route.id} tab={route.tab || 'activity'} />;
  return <SalesHome tab={route.tab || 'customers'} setTab={(x) => nav('sales', null, x)} />;
}

function SalesHome({ tab, setTab }) {
  const app = useApp();
  const { farm, snap, t, fmt, ui, nav, today, lang } = app;
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  const [sort, setSort] = useState('due');
  const overdue = useOverdue();
  const custs = farm.customers.filter((c) => !!c.archived === arch && (!q || `${c.name} ${c.phone} ${c.accountNo}`.toLowerCase().includes(q.toLowerCase())))
    .map((c) => {
      const last = farm.records.filter((r) => live(r) && (r.customerId === c.id)).reduce((m, r) => (r.day > m ? r.day : m), '');
      const inv = snap.cust[c.id]?.dueC ? customerInvoices(farm, c.id, snap, { today, termsDays: farm.settings.termsDays }) : [];
      const status = snap.cust[c.id]?.creditBalC ? 'credit' : !snap.cust[c.id]?.dueC ? 'clear' : inv.some((i) => i.status === 'overdue') ? 'overdue' : 'owing';
      return { c, last, status, due: snap.cust[c.id]?.dueC || 0 };
    }).sort((a, b) => (sort === 'name' ? a.c.name.localeCompare(b.c.name) : sort === 'recent' ? (b.last || '').localeCompare(a.last || '') : b.due - a.due || a.c.name.localeCompare(b.c.name)));
  return (
    <div className="screen">
      <PageHead title={t('nav.sales')} actions={<><Button icon="plus" onClick={() => ui.open('customer')}>{t('sales.newCustomer')}</Button><Button variant="primary" icon="cart" onClick={() => ui.open('sale')}>{t('new.sale')}</Button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'customers', label: t('sales.customers'), count: farm.customers.filter((c) => !c.archived).length }, { value: 'invoices', label: t('sales.invoices') }, { value: 'reminders', label: t('rem.tab'), count: overdue.filter((r) => r.remindNow).length || undefined }]} />
      {tab === 'customers' ? (
        <section className="panel">
          <FilterPanel id="customers" onReset={() => { setQ(''); setArch(false); setSort('due'); }}
            chips={[{ label: t(`flt.sort.${sort}`), active: sort !== 'due' }, q && { label: `“${q}”`, active: true }, arch && { label: t('archived'), active: true }]}>
            <div className="filter-row">
              <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
              <Seg small label={t('flt.sortBy')} value={sort} onChange={setSort} options={['due', 'name', 'recent'].map((k) => ({ value: k, label: t(`flt.sort.${k}`) }))} />
              <label className="mini-check"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> {t('showArchived')}</label>
            </div>
          </FilterPanel>
          {custs.length ? (
            <div className="cards">
              {custs.map(({ c, last, status, due }) => (
                <button type="button" key={c.id} className="party-card" onClick={() => nav('sales', c.id)}>
                  <div className="pc-top"><b>{c.name}</b><Pill status={status}>{t(`st.${status}`)}</Pill></div>
                  <div className="pc-amt num">{fmt(due || snap.cust[c.id]?.creditBalC || 0)}</div>
                  <div className="pc-sub">{c.accountNo} · {last ? `${t('cust.lastActivity')} ${dayLabel(last, lang)}` : c.phone}</div>
                </button>
              ))}
            </div>
          ) : <Empty title={t('sales.noCustomers')} body={t('sales.noCustomersHint')} icon="people" action={<Button variant="primary" icon="plus" onClick={() => ui.open('customer')}>{t('sales.newCustomer')}</Button>} />}
        </section>
      ) : tab === 'reminders' ? <RemindersPanel /> : <InvoiceRegister />}
    </div>
  );
}

function CustomerAccount({ id, tab = 'activity' }) {
  const app = useApp();
  const { farm, snap, t, fmt, ui, nav, today, lang, commit, actor } = app;
  const c = farm.customers.find((x) => x.id === id);
  if (!c) return <Empty title={t('e.notFound')} />;
  const s = snap.cust[id] || {};
  const inv = customerInvoices(farm, id, snap, { today, termsDays: farm.settings.termsDays });
  const invMap = new Map(inv.map((i) => [i.sale.id, i]));
  const recs = farm.records.filter((r) => live(r) && r.customerId === id && (r.type === 'sale' || r.type === 'payment')).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
  const list = tab === 'statement' ? [] : recs.filter((r) => tab === 'activity' || (tab === 'invoices' ? r.type === 'sale' : r.type === 'payment'));
  return (
    <div className="screen">
      <PageHead back={() => nav('sales', null, 'customers')} title={c.name} sub={`${c.accountNo || ''}${c.phone ? ` · ${c.phone}` : ''}`}
        actions={<>
          <Button icon="file" onClick={() => ui.open('doc', { kind: 'statement', party: 'customer', partyId: id })}>{t('cust.statement')}</Button>
          <Button icon="edit" onClick={() => ui.open('customer', { record: c })}>{t('edit')}</Button>
          <Button icon="archive" onClick={() => commit((f) => upsert(f, 'customers', { id, archived: !c.archived }, actor), { label: c.archived ? t('unarchive') : t('archive') })}>{c.archived ? t('unarchive') : t('archive')}</Button>
        <Button icon="trash" variant="danger" onClick={() => ui.open('deleteMaster', { list: 'customers', id, onDone: (m) => m !== 'archive' && nav('sales', null, 'customers') })}>{t('delete')}</Button>
        </>} />
      <section className="account-head sticky-bal">
        <div><div className="muted">{s.creditBalC ? t('cust.credit') : t('cust.due')}</div><div className="acct-big num">{fmt(s.creditBalC || s.dueC || 0)}</div></div>
        <div className="row-btns">
          {s.dueC > 0 && <Button icon="whatsapp" onClick={() => ui.open('reminder', { customerId: id })}>{t('rem.send')}</Button>}
          <Button icon="cart" onClick={() => ui.open('sale', { customerId: id })}>{t('cust.newSale')}</Button>
          <Button variant="primary" icon="cash" onClick={() => ui.open('payment', { customerId: id })}>{t('cust.takePayment')}</Button>
        </div>
      </section>
      <Tabs value={tab} onChange={(x) => nav('sales', id, x)} tabs={[{ value: 'activity', label: t('cust.activity') }, { value: 'invoices', label: t('cust.sales'), count: inv.length }, { value: 'payments', label: t('cust.payments') }]} />
      <section className="panel">
        {list.length ? list.map((r) => {
          const i = invMap.get(r.id);
          return <RecordRow key={r.id} r={r} hideParty dir={r.type === 'payment' ? 1 : 0} onOpen={() => ui.open('drawer', { id: r.id })}
            right={r.type === 'sale' ? <span className="amt-stack"><span>{r.voided ? <s>{fmt(r.totalC)}</s> : fmt(r.totalC)}</span>{i && <Pill status={i.status}>{t(`st.${i.status}`)}{i.status !== 'paid' && ` · ${fmt(i.dueC)}`}</Pill>}</span> : undefined} />;
        }) : <Empty title={t('sales.noSales')} icon="cart" />}
      </section>
      <Attachments list="customers" id={id} />
    </div>
  );
}

/* ───────────── Expenses ───────────── */
export function ExpensesScreen() {
  const app = useApp();
  const { farm, snap, t, fmt, ui, nav, route, lang, today, commit, actor } = app;
  const tab = route.tab || 'all';
  const per = usePeriod('month');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [sel, setSel] = useState([]);
  const recById = useMemo(() => new Map(farm.records.map((r) => [r.id, r])), [farm.records]);
  const rows = snap.expenses.filter((e) => e.day >= per.range.from && e.day <= per.range.to)
    .filter((e) => !group || groupOf(e.category, farm.settings.categories) === group)
    .filter((e) => tab !== 'open' || (e.origin === 'farm' || e.origin === 'supplier') && e.paidC < e.amountC)
    .filter((e) => !q || `${t(`c.${e.category}`)} ${e.vendor || ''} ${e.note || ''} ${e.supplierId ? app.names.supplier(e.supplierId) : ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.day.localeCompare(a.day));
  const total = rows.reduce((s, e) => s + e.amountC, 0);
  const byCat = {};
  for (const e of rows) byCat[e.category] = (byCat[e.category] || 0) + e.amountC;
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const days = Math.max(1, daysBetween(per.range.from.startsWith('0000') ? (rows.at(-1)?.day || today) : per.range.from, per.range.to.startsWith('9999') ? today : (per.range.to > today ? today : per.range.to)) + 1);
  const byGroup = {};
  for (const e of rows) { const g = groupOf(e.category, farm.settings.categories); byGroup[g] = (byGroup[g] || 0) + e.amountC; }
  const maxG = Math.max(1, ...Object.values(byGroup));
  return (
    <div className="screen">
      <PageHead title={t('nav.expenses')} actions={<><Button icon="calendar" onClick={() => ui.open('obligation')}>{t('obl.new')}</Button><Button variant="primary" icon="plus" onClick={() => ui.open('expense')}>{t('new.expense')}</Button></>} />
      <Tabs value={tab} onChange={(x) => nav('expenses', null, x)} tabs={[{ value: 'all', label: t('all') }, { value: 'open', label: t('exp.open') }, { value: 'obligations', label: t('obl.title'), count: farm.obligations.filter((o) => !o.archived).length }]} />
      {tab === 'obligations' ? <Obligations /> : (
        <>
          <section className="stats-row">
            <Stat label={t('total')} value={fmt(total)} />
            <Stat label={t('exp.topCat')} value={top ? t(`c.${top[0]}`) : '—'} sub={top ? fmt(top[1]) : ''} />
            <Stat label={t('exp.dailyAvg')} value={fmt(Math.round(total / days))} />
            <Stat label={t('exp.open')} value={fmt(snap.payablesC + snap.supplierDueC)} onClick={() => nav('expenses', null, 'open')} />
          </section>
          {(() => {
            // How this period's costs were paid: once a cost is a bill, paying it later only settles it.
            const inP = (d) => d >= per.range.from && d <= per.range.to;
            const all = snap.expenses.filter((e) => inP(e.day));
            const costs = all.reduce((x, e) => x + e.amountC, 0);
            const atOnce = all.reduce((x, e) => x + (e.paidAtEntryC ?? e.paidC), 0);
            const supPaid = snap.flows.filter((fl) => fl.kind === 'supplierPay' && inP(fl.day)).reduce((x, fl) => x + fl.amountC, 0)
              + farm.records.filter((r) => !r.deletedAt && r.type === 'supplierPay' && r.source === 'person' && inP(r.day)).reduce((x, r) => x + (r.amountC || 0), 0);
            if (!costs && !supPaid) return null;
            return (
              <section className="panel exp-flow">
                <div className="ef-row">
                  <div><span className="muted small">{t('ef.costs')}</span><b className="num">{fmt(costs)}</b></div>
                  <span className="ef-op" aria-hidden="true">=</span>
                  <div><span className="muted small">{t('ef.atOnce')}</span><b className="num">{fmt(atOnce)}</b></div>
                  <span className="ef-op" aria-hidden="true">+</span>
                  <div><span className="muted small">{t('ef.later')}</span><b className="num">{fmt(costs - atOnce)}</b></div>
                </div>
                <p className="muted small">{t('ef.rule')}{supPaid ? ` ${t('ef.supPaid', { a: fmt(supPaid) })}` : ''}</p>
              </section>
            );
          })()}
          {Object.keys(byGroup).length > 1 && (
            <section className="panel bars">
              <h2>{t('exp.byGroup')}</h2>
              {Object.entries(byGroup).sort((a, b) => b[1] - a[1]).map(([g, v]) => (
                <button type="button" key={g} className={`bar-row ${group === g ? 'on' : ''}`} onClick={() => setGroup(group === g ? '' : g)}>
                  <span className="bar-label">{t(`g.${g}`)}</span><span className="bar-track"><span className="bar-fill" style={{ inlineSize: `${(v / maxG) * 100}%` }} /></span><span className="num">{fmt(v)}</span>
                </button>
              ))}
            </section>
          )}
          <section className="panel">
            <FilterPanel id="expenses" onReset={() => { per.reset(); setQ(''); setGroup(''); }}
              chips={[{ label: per.label, active: !per.isDefault }, group && { label: t(`g.${group}`), active: true }, q && { label: `“${q}”`, active: true }]}>
              <PeriodBar value={per.p} onChange={per.onChange} range={per.range} setRange={per.setRange} />
              <div className="filter-row">
                <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
                <Select className="compact" label={t('exp.group')} value={group} onChange={setGroup} options={Object.keys(EXPENSE_GROUPS).map((g) => ({ value: g, label: t(`g.${g}`) }))} placeholder={t('all')} />
              </div>
            </FilterPanel>
            {rows.length ? (
              <Grouped rows={rows} groupKey={(r) => r.day.slice(0, 7)} renderGroup={(g) => <><span>{monthLabel(g.key, lang)}</span><span className="num muted">{fmt(g.rows.reduce((s, r) => s + r.amountC, 0))}</span></>}
                renderRow={(e) => {
                  const r = recById.get(e.id);
                  const st = e.paidC >= e.amountC ? 'paid' : e.paidC > 0 ? 'partial' : (e.dueDay && e.dueDay < today ? 'overdue' : 'unpaid');
                  return (
                    <div key={e.id + e.category + e.amountC} className="row">
                      {r?.type === 'expense' && <input type="checkbox" className="row-check" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} aria-label={t('select')} />}
                      <button type="button" className="row-main" onClick={() => ui.open('drawer', { id: e.id })}>
                        <span className="row-ico emoji">{CATEGORY_ICON[e.category] || '•'}</span>
                        <span className="row-text">
                          <span className="row-title">{t(`c.${e.category}`) !== `c.${e.category}` ? t(`c.${e.category}`) : (farm.settings.categories.find((c) => c.key === e.category)?.name || e.category)}{r?.history?.length > 0 && <span className="edited-dot" />}</span>
                          <span className="row-sub">{dayLabel(e.day, lang)} · {e.origin === 'customer' ? t('exp.fromCustomer') : e.origin === 'person' ? t('exp.fromPerson', { n: app.names.person(e.personId) }) : e.supplierId ? app.names.supplier(e.supplierId) : (e.vendor || e.note || t(`exp.src.${r?.source || 'cash'}`))}</span>
                        </span>
                        <span className="amt-stack"><span className="num">{fmt(e.amountC)}</span>{(e.origin === 'farm' || e.origin === 'supplier') && <Pill status={st}>{t(`st.${st}`)}</Pill>}</span>
                      </button>
                      {tab === 'open' && r?.type === 'expense' && (e.origin === 'farm') && <Button size="sm" onClick={() => commit((f) => editRecord(f, e.id, { paidC: e.amountC }, actor, t('exp.payBill')), { label: t('st.paid') })}>{t('exp.payBill')}</Button>}
                      {tab === 'open' && e.origin === 'supplier' && <Button size="sm" onClick={() => ui.open('supplierPay', { supplierId: e.supplierId, billId: e.id })}>{t('exp.payBill')}</Button>}
                    </div>
                  );
                }} />
            ) : <Empty title={t('exp.none')} body={t('exp.noneHint')} icon="receipt" action={<Button variant="primary" icon="plus" onClick={() => ui.open('expense')}>{t('new.expense')}</Button>} />}
          </section>
          <SelectionBar selected={sel} clear={() => setSel([])} totalC={rows.filter((e) => sel.includes(e.id)).reduce((s, e) => s + e.amountC, 0)} />
        </>
      )}
    </div>
  );
}

function nextDue(day, freq) {
  if (freq === 'weekly') return addDays(day, 7);
  const d = new Date(day + 'T12:00:00');
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

function Obligations() {
  const { farm, t, fmt, ui, today, commit, actor, lang } = useApp();
  const list = farm.obligations.filter((o) => !o.archived).sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''));
  const pay = (o) => {
    const cycle = o.nextDue;
    if (farm.records.some((r) => live(r) && r.obligationId === o.id && r.cycle === cycle)) return;
    const nd = nextDue(cycle, o.freq);
    commit((f) => {
      let x = addRecord(f, { type: 'expense', day: today, category: o.category || 'rent', amountC: o.amountC, paidC: o.amountC, source: 'cash', vendor: o.party, obligationId: o.id, cycle }, actor);
      x = upsert(x, 'obligations', { id: o.id, nextDue: nd, archived: !nd, lastPaid: cycle }, actor);
      return x;
    }, { label: t('obl.markPaid') });
  };
  if (!list.length) return <section className="panel"><Empty title={t('obl.title')} body={t('obl.none')} icon="calendar" action={<Button variant="primary" icon="plus" onClick={() => ui.open('obligation')}>{t('obl.new')}</Button>} /></section>;
  return (
    <section className="panel">
      {list.map((o) => {
        const d = daysBetween(today, o.nextDue);
        const tone = d < 0 ? 'overdue' : d <= 3 ? 'partial' : 'clear';
        return (
          <div className="row" key={o.id}>
            <button type="button" className="row-main" onClick={() => ui.open('obligation', { record: o })}>
              <span className="row-ico"><Icon name="calendar" /></span>
              <span className="row-text"><span className="row-title">{o.party}</span><span className="row-sub">{t(`ok.${o.kind}`)} · {t(`f.${o.freq}`)} · {dayLabel(o.nextDue, lang)}</span></span>
              <span className="amt-stack"><span className="num">{fmt(o.amountC)}</span><Pill status={tone}>{d < 0 ? t('obl.overdue', { n: -d }) : d === 0 ? t('obl.dueToday') : t('obl.dueIn', { n: d })}</Pill></span>
            </button>
            <Button size="sm" variant="primary" onClick={() => pay(o)}>{t('obl.markPaid')}</Button>
          </div>
        );
      })}
    </section>
  );
}

/* ───────────── Suppliers ───────────── */
export function SuppliersScreen() {
  const { route } = useApp();
  return route.id ? <SupplierAccount id={route.id} tab={route.tab || 'bills'} /> : <SupplierList tab={route.tab === 'orders' ? 'orders' : 'suppliers'} />;
}

function SupplierList({ tab }) {
  const { farm, snap, t, fmt, ui, nav, today, lang } = useApp();
  const activeOrders = orderList(farm).filter((o) => ['open', 'partial'].includes(o.status)).length;
  const [arch, setArch] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('due');
  const month = today.slice(0, 7);
  const paidMonth = farm.records.filter((r) => live(r) && r.type === 'supplierPay' && r.day.startsWith(month)).reduce((s, r) => s + r.amountC, 0)
    + farm.records.filter((r) => live(r) && r.type === 'expense' && r.supplierId && r.day.startsWith(month)).reduce((s, r) => s + Math.min(r.paidC || 0, r.amountC), 0);
  const rows = farm.suppliers.filter((s) => !!s.archived === arch).map((s) => {
    const { bills } = supplierBills(farm, s.id, { today });
    const over = bills.filter((b) => b.status === 'overdue').reduce((a, b) => a + b.dueC, 0);
    const due = snap.sup[s.id]?.dueC || 0;
    const last = farm.records.filter((r) => live(r) && r.supplierId === s.id).reduce((m, r) => (r.day > m ? r.day : m), '');
    return { s, due, over, last, status: over ? 'overdue' : due ? 'owing' : 'clear' };
  }).filter((r) => !q || `${r.s.name} ${r.s.phone || ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === 'name' ? a.s.name.localeCompare(b.s.name) : sort === 'recent' ? (b.last || '').localeCompare(a.last || '') : b.due - a.due));
  const totalOver = rows.reduce((a, r) => a + r.over, 0);
  return (
    <div className="screen">
      <PageHead title={t('sup.title')} actions={<><Button icon="plus" onClick={() => ui.open('supplier')}>{t('sup.new')}</Button><Button icon="file" onClick={() => ui.open('order')}>{t('po.new')}</Button><Button variant="primary" icon="truck" onClick={() => ui.open('supplierPay')}>{t('sup.pay')}</Button></>} />
      <Tabs value={tab} onChange={(x) => nav('suppliers', null, x === 'suppliers' ? null : x)} tabs={[{ value: 'suppliers', label: t('sup.title'), count: farm.suppliers.filter((s) => !s.archived).length }, { value: 'orders', label: t('po.title'), count: activeOrders || undefined }]} />
      {tab === 'orders' ? <OrdersList /> : (<>
      <section className="stats-row">
        <Stat label={t('sup.totalOwe')} value={fmt(snap.supplierDueC)} />
        <Stat label={t('sup.overdue')} value={fmt(totalOver)} tone={totalOver ? 'out' : null} />
        <Stat label={t('sup.paidMonth')} value={fmt(paidMonth)} />
      </section>
      <section className="panel">
        <FilterPanel id="suppliers" onReset={() => { setArch(false); setQ(''); setSort('due'); }}
          chips={[{ label: t(`flt.sort.${sort}`), active: sort !== 'due' }, q && { label: `“${q}”`, active: true }, arch && { label: t('archived'), active: true }]}>
          <div className="filter-row">
            <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
            <Seg small label={t('flt.sortBy')} value={sort} onChange={setSort} options={['due', 'name', 'recent'].map((k) => ({ value: k, label: t(`flt.sort.${k}`) }))} />
            <label className="mini-check"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> {t('showArchived')}</label>
          </div>
        </FilterPanel>
        {rows.length ? (
          <div className="cards">
            {rows.map(({ s, due, status, last }) => (
              <button type="button" key={s.id} className="party-card" onClick={() => nav('suppliers', s.id)}>
                <div className="pc-top"><b>{s.name}</b><Pill status={status}>{t(`st.${status}`)}</Pill></div>
                <div className="pc-amt num">{fmt(due)}</div>
                <div className="pc-sub">{(s.tags || []).map((x) => t(`tag.${x}`)).join('، ')}{last && ` · ${dayLabel(last, lang)}`}</div>
              </button>
            ))}
          </div>
        ) : <Empty title={t('sup.none')} body={t('sup.noneHint')} icon="truck" action={<Button variant="primary" icon="plus" onClick={() => ui.open('supplier')}>{t('sup.new')}</Button>} />}
      </section>
      </>)}
    </div>
  );
}

function SupplierAccount({ id, tab }) {
  const app = useApp();
  const { farm, snap, t, fmt, ui, nav, today, lang, commit, actor } = app;
  const [showAll, setShowAll] = useState(false);
  const s = farm.suppliers.find((x) => x.id === id);
  if (!s) return <Empty title={t('e.notFound')} />;
  const { bills, creditC } = supplierBills(farm, id, { today });
  const pays = farm.records.filter((r) => live(r) && r.type === 'supplierPay' && r.supplierId === id).sort((a, b) => b.day.localeCompare(a.day));
  const due = snap.sup[id]?.dueC || 0;
  return (
    <div className="screen">
      <PageHead back={() => nav('suppliers')} title={s.name} sub={(s.tags || []).map((x) => t(`tag.${x}`)).join('، ')}
        actions={<>
          <Button icon="file" onClick={() => ui.open('doc', { kind: 'statement', party: 'supplier', partyId: id })}>{t('cust.statement')}</Button>
          <Button icon="edit" onClick={() => ui.open('supplier', { record: s })}>{t('edit')}</Button>
          <Button icon="archive" onClick={() => commit((f) => upsert(f, 'suppliers', { id, archived: !s.archived }, actor), { label: s.archived ? t('unarchive') : t('archive') })}>{s.archived ? t('unarchive') : t('archive')}</Button>
        <Button icon="trash" variant="danger" onClick={() => ui.open('deleteMaster', { list: 'suppliers', id, onDone: (m) => m !== 'archive' && nav('suppliers') })}>{t('delete')}</Button>
        </>} />
      <section className="account-head sticky-bal">
        <div><div className="muted">{creditC ? t('sup.credit') : t('sup.we_owe')}</div><div className="acct-big num">{fmt(creditC || due)}</div></div>
        <div className="row-btns">
          <Button icon="file" onClick={() => ui.open('order', { supplierId: id })}>{t('po.new')}</Button>
          <Button icon="receipt" onClick={() => ui.open('expense', { supplierId: id })}>{t('sup.bill')}</Button>
          <Button variant="primary" icon="cash" onClick={() => ui.open('supplierPay', { supplierId: id })}>{t('sup.pay')}</Button>
        </div>
      </section>
      <Tabs value={tab} onChange={(x) => nav('suppliers', id, x)} tabs={[{ value: 'bills', label: t('sup.bills'), count: bills.filter((b) => b.dueC > 0).length }, { value: 'payments', label: t('sup.payments'), count: pays.length }, { value: 'orders', label: t('po.title'), count: orderList(farm).filter((o) => o.order.supplierId === id).length || undefined }]} />
      {tab === 'orders' ? <OrdersList supplierId={id} /> : <section className="panel">
        {tab === 'bills' ? (bills.length ? [...bills].reverse().map((b) => (
          <div className="row" key={b.id}>
            <button type="button" className="row-main" onClick={() => (b.record ? ui.open('drawer', { id: b.id }) : ui.open('supplier', { record: s }))}>
              <span className="row-ico emoji">{CATEGORY_ICON[b.category] || '•'}</span>
              <span className="row-text"><span className="row-title">{b.opening ? t('c.opening') : t(`c.${b.category}`)}</span><span className="row-sub">{b.record?.orderId && <span className="row-no num">{poNo((farm.orders || []).find((o) => o.id === b.record.orderId), farm.settings)}{b.record.deliveryNo ? ` · ${b.record.deliveryNo}` : ''}</span>}{b.opening ? t('sup.openingHint') : dayLabel(b.day, lang)}{b.dueDay ? ` · ${t('exp.due')} ${dayLabel(b.dueDay, lang)}` : ''}</span></span>
              <span className="amt-stack"><span className="num">{fmt(b.amountC)}</span><Pill status={b.status}>{t(`st.${b.status}`)}{b.dueC > 0 && b.dueC < b.amountC ? ` · ${fmt(b.dueC)}` : ''}</Pill></span>
            </button>
            {b.dueC > 0 && <Button size="sm" onClick={() => ui.open('supplierPay', { supplierId: id, billId: b.id })}>{t('exp.payBill')}</Button>}
          </div>
        )) : <Empty title={t('sup.bills')} icon="receipt" />) : (
          pays.length ? (showAll ? pays : pays.slice(0, 12)).map((r) => <RecordRow key={r.id} r={r} dir={-1} onOpen={() => ui.open('drawer', { id: r.id })} />) : <Empty title={t('sup.payments')} icon="cash" />
        )}
        {tab === 'payments' && pays.length > 12 && !showAll && <Button className="more-btn" onClick={() => setShowAll(true)}>{t('more')} ({pays.length - 12})</Button>}
      </section>}
      <Attachments list="suppliers" id={id} />
    </div>
  );
}

/* ───────────── Managers & funders ───────────── */
export function PeopleScreen() {
  const { route } = useApp();
  return route.id ? <PersonAccount id={route.id} /> : <PeopleList />;
}

function PeopleList() {
  const { farm, snap, t, fmt, ui, nav } = useApp();
  return (
    <div className="screen">
      <PageHead title={t('ppl.title')} actions={<><Button icon="plus" onClick={() => ui.open('person')}>{t('ppl.new')}</Button><Button variant="primary" icon="people" onClick={() => ui.open('capital')}>{t('new.person')}</Button></>} />
      <section className="stats-row"><Stat label={t('cash.capital')} value={fmt(snap.capitalC)} /></section>
      <section className="panel">
        {farm.people.length ? (
          <div className="cards">
            {farm.people.filter((p) => !p.archived).map((p) => {
              const owed = snap.people[p.id]?.owedC || 0;
              const st = owed > 0 ? 'owedToThem' : owed < 0 ? 'owesFarm' : 'settled';
              return (
                <button type="button" key={p.id} className="party-card" onClick={() => nav('people', p.id)}>
                  <div className="pc-top"><b>{p.name}</b><Pill tone={owed > 0 ? 'info' : owed < 0 ? 'warn' : 'good'}>{t(`ppl.${st}`)}</Pill></div>
                  <div className="pc-amt num">{fmt(Math.abs(owed))}</div>
                  <div className="pc-sub">{p.phone}</div>
                </button>
              );
            })}
          </div>
        ) : <Empty title={t('ppl.none')} body={t('ppl.noneHint')} icon="people" action={<Button variant="primary" icon="plus" onClick={() => ui.open('person')}>{t('ppl.new')}</Button>} />}
      </section>
    </div>
  );
}

function PersonAccount({ id }) {
  const app = useApp();
  const { farm, snap, t, fmt, ui, nav, lang } = app;
  const p = farm.people.find((x) => x.id === id);
  const per = usePeriod('all');
  if (!p) return <Empty title={t('e.notFound')} />;
  const lines = partyLines(farm, 'person', id).filter((l) => l.day >= per.range.from && l.day <= per.range.to).reverse();
  const owed = snap.people[id]?.owedC || 0;
  return (
    <div className="screen">
      <PageHead back={() => nav('people')} title={p.name} sub={p.phone}
        actions={<><Button icon="file" onClick={() => ui.open('doc', { kind: 'statement', party: 'person', partyId: id })}>{t('cust.statement')}</Button><Button icon="edit" onClick={() => ui.open('person', { record: p })}>{t('edit')}</Button><Button icon="trash" variant="danger" onClick={() => ui.open('deleteMaster', { list: 'people', id, onDone: (m) => m !== 'archive' && nav('people') })}>{t('delete')}</Button></>} />
      <section className="account-head sticky-bal">
        <div><div className="muted">{owed >= 0 ? t('ppl.owedToThem') : t('ppl.owesFarm')}</div><div className="acct-big num">{fmt(Math.abs(owed))}</div></div>
        <Button variant="primary" icon="plus" onClick={() => ui.open('capital', { personId: id })}>{t('ppl.what')}</Button>
      </section>
      <section className="panel">
        <FilterPanel id="person" onReset={per.reset} chips={[{ label: per.label, active: !per.isDefault }]}>
          <PeriodBar value={per.p} onChange={per.onChange} range={per.range} setRange={per.setRange} options={['month', 'year', 'all', 'custom']} />
        </FilterPanel>
        {lines.length ? lines.map((l, i) => l.record && (
          <RecordRow key={l.ref + l.kind + i} r={l.record} onOpen={() => ui.open('drawer', { id: l.ref })}
            right={<span className={`num ${l.chargeC ? 'in' : 'out'}`}>{l.chargeC ? `+${fmt(l.chargeC)}` : `−${fmt(l.creditC).replace('−', '')}`}</span>} />
        )) : <Empty title={t('cash.empty')} icon="people" action={<Button variant="primary" onClick={() => ui.open('capital', { personId: id })}>{t('ppl.what')}</Button>} />}
      </section>
      <Attachments list="people" id={id} />
    </div>
  );
}
