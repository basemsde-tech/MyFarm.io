import React, { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Tabs, Seg, DateInput, FilterPanel, dayLabel, monthLabel } from './kit.jsx';
import { PageHead, usePeriod, downloadText } from './screens-money.jsx';
import { profitAndLoss, balanceSheet, receivablesAging, payablesAging, trialBalance, journal, taxSummary, invoiceRegister, journalRows, docNo, BUCKETS, typeOf } from '../core/accounts.mjs';
import { toCSV } from '../core/reports.mjs';
import { Help } from './help.jsx';
import { groupOf, EXPENSE_GROUPS } from '../core/catalog.mjs';
import { periodRange } from '../core/statement.mjs';
import { addDays } from '../core/species.mjs';

/** Human name for a ledger account. */
export function useAcctLabel() {
  const { t, farm } = useApp();
  return (acct) => {
    const [k, sub] = acct.split(':');
    if (k === 'rev') return sub === 'customerPaid' ? t('acct.customerPaid') : `${t('acct.sales')} · ${t(`pr.${sub}`)}`;
    if (k === 'exp') { const c = (farm.settings.categories || []).find((x) => x.key === sub); return c ? c.name : t(`c.${sub}`); }
    return t(`acct.${k}`);
  };
}

/** The same length of time immediately before a period, for comparison. */
function previousOf(range, today) {
  const to = range.to.startsWith('9999') ? today : range.to;
  if (range.from.startsWith('0000')) return null;
  const days = Math.round((new Date(to + 'T12:00:00') - new Date(range.from + 'T12:00:00')) / 86400000) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

function Delta({ now, before, invert }) {
  const { fmt } = useApp();
  if (before == null) return <span className="muted">—</span>;
  const d = now - before;
  if (!d) return <span className="muted">±0</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={`delta-txt ${good ? 'good' : 'bad'}`}>{d > 0 ? '▲' : '▼'} {fmt(Math.abs(d))}</span>;
}

/* ───────────── Profit & loss ───────────── */
function ProfitLoss() {
  const { farm, t, fmt, today, lang } = useApp();
  const per = usePeriod('month');
  const label = useAcctLabel();
  const pl = useMemo(() => profitAndLoss(farm, per.range), [farm, per.range]);
  const prevRange = previousOf(per.range, today);
  const prev = useMemo(() => (prevRange ? profitAndLoss(farm, prevRange) : null), [farm, prevRange?.from, prevRange?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const custom = farm.settings.categories || [];
  const groups = {};
  for (const [cat, v] of Object.entries(pl.expenses)) (groups[groupOf(cat, custom)] ||= []).push([cat, v]);
  const groupOrder = Object.keys(EXPENSE_GROUPS).filter((g) => groups[g]);
  const exportCSV = () => downloadText(`profit-loss-${per.range.from}.csv`, toCSV([
    [t('acc.pl'), per.label], [],
    [t('acc.income')], ...Object.entries(pl.income).map(([k, v]) => [label(`rev:${k}`), v / 100]), [t('acc.totalIncome'), pl.incomeC / 100], [],
    [t('acc.expenses')], ...Object.entries(pl.expenses).map(([k, v]) => [label(`exp:${k}`), v / 100]), [t('acc.totalExpenses'), pl.expenseC / 100], [],
    [t('acc.netProfit'), pl.profitC / 100],
  ]));
  const row = (name, v, pv, cls = '', invert) => (
    <tr className={cls}><td>{name}</td><td className="num">{fmt(v)}</td><td className="num cmp">{prev ? fmt(pv || 0) : '—'}</td><td className="num cmp"><Delta now={v} before={prev ? pv || 0 : null} invert={invert} /></td></tr>
  );
  return (
    <>
      <FilterPanel id="pl" onReset={per.reset} chips={[{ label: per.label, active: !per.isDefault }]} extra={<Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>}>
        <PeriodBarLite per={per} />
      </FilterPanel>
      <section className="stats-row">
        <Stat label={t('acc.totalIncome')} value={fmt(pl.incomeC)} sub={prev && <Delta now={pl.incomeC} before={prev.incomeC} />} />
        <Stat label={t('acc.totalExpenses')} value={fmt(pl.expenseC)} sub={prev && <Delta now={pl.expenseC} before={prev.expenseC} invert />} />
        <Stat label={t('acc.netProfit')} value={fmt(pl.profitC)} tone={pl.profitC >= 0 ? 'in' : 'out'} sub={pl.marginPct != null ? t('acc.margin', { p: pl.marginPct }) : null} />
      </section>
      <section className="panel fin">
        <div className="fin-head"><h2>{t('acc.pl')} <Help k="pl" more="accounts" /></h2><span className="muted small">{per.label}{prevRange ? ` · ${t('acc.vs')} ${dayLabel(prevRange.from, lang)} – ${dayLabel(prevRange.to, lang)}` : ''}</span></div>
        <div className="table-wrap">
          <table className="tbl fin-tbl">
            <thead><tr><th /><th className="num">{t('acc.thisPeriod')}</th><th className="num cmp">{t('acc.previous')}</th><th className="num cmp">{t('acc.change')}</th></tr></thead>
            <tbody>
              <tr className="fin-sec"><td colSpan={4}>{t('acc.income')}</td></tr>
              {Object.entries(pl.income).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(label(`rev:${k}`), v, prev?.income[k]))}
              {!Object.keys(pl.income).length && <tr><td colSpan={4} className="muted">{t('sales.noSales')}</td></tr>}
              {row(t('acc.totalIncome'), pl.incomeC, prev?.incomeC, 'fin-sum')}
              <tr className="fin-sec"><td colSpan={4}>{t('acc.expenses')}</td></tr>
              {groupOrder.map((g) => (
                <React.Fragment key={g}>
                  <tr className="fin-grp"><td colSpan={4}>{t(`g.${g}`)}</td></tr>
                  {groups[g].sort((a, b) => b[1] - a[1]).map(([k, v]) => row(label(`exp:${k}`), v, prev?.expenses[k], 'fin-sub', true))}
                </React.Fragment>
              ))}
              {!groupOrder.length && <tr><td colSpan={4} className="muted">{t('exp.none')}</td></tr>}
              {row(t('acc.totalExpenses'), pl.expenseC, prev?.expenseC, 'fin-sum', true)}
              {row(t('acc.netProfit'), pl.profitC, prev?.profitC, `fin-net ${pl.profitC < 0 ? 'loss' : ''}`)}
            </tbody>
          </table>
        </div>
        <p className="muted small">{t('acc.plHint')}</p>
      </section>
    </>
  );
}

function PeriodBarLite({ per, options = ['month', 'lastMonth', '30', 'year', 'all', 'custom'] }) {
  const { t } = useApp();
  return (
    <div className="period-bar">
      <Seg small wrap value={per.p} onChange={per.onChange} options={options.map((p) => ({ value: p, label: t(`p.${p}`) }))} />
      {per.p === 'custom' && (
        <div className="grid2 tight">
          <DateInput label={t('from')} value={per.range.from} onChange={(v) => per.setRange({ ...per.range, from: v })} />
          <DateInput label={t('to')} value={per.range.to} onChange={(v) => per.setRange({ ...per.range, to: v })} />
        </div>
      )}
    </div>
  );
}

/* ───────────── Balance sheet ───────────── */
function BalanceSheet() {
  const { farm, t, fmt, today, lang } = useApp();
  const [asOf, setAsOf] = useState(today);
  const bs = useMemo(() => balanceSheet(farm, { asOf }), [farm, asOf]);
  const line = (k, v, hint) => (v ? <tr key={k}><td>{t(`bs.${k}`)}{hint && <div className="muted small">{hint}</div>}</td><td className="num">{fmt(v)}</td></tr> : null);
  const exportCSV = () => downloadText(`balance-sheet-${asOf}.csv`, toCSV([
    [t('acc.bs'), asOf], [], [t('bs.owns')], ...Object.entries(bs.assets).filter(([, v]) => v).map(([k, v]) => [t(`bs.${k}`), v / 100]), [t('bs.totalOwns'), bs.totalAssets / 100], [],
    [t('bs.owes')], ...Object.entries(bs.liabilities).filter(([, v]) => v).map(([k, v]) => [t(`bs.${k}`), v / 100]), [t('bs.totalOwes'), bs.totalLiab / 100], [],
    [t('bs.net')], ...Object.entries(bs.equity).filter(([, v]) => v).map(([k, v]) => [t(`bs.${k}`), v / 100]), [t('bs.totalNet'), bs.totalEquity / 100],
  ]));
  return (
    <>
      <FilterPanel id="bs" onReset={() => setAsOf(today)} chips={[{ label: asOf === today ? t('today') : dayLabel(asOf, lang, { day: 'numeric', month: 'short', year: 'numeric' }), active: asOf !== today }]} extra={<Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>}>
        <div className="filter-row"><DateInput label={t('bs.asOf')} value={asOf} max={today} onChange={(v) => setAsOf(v || today)} /></div>
      </FilterPanel>
      <section className="stats-row">
        <Stat label={t('bs.totalOwns')} value={fmt(bs.totalAssets)} />
        <Stat label={t('bs.totalOwes')} value={fmt(bs.totalLiab)} />
        <Stat label={t('bs.totalNet')} value={fmt(bs.totalEquity)} tone={bs.totalEquity >= 0 ? 'in' : 'out'} />
      </section>
      <div className="two-col">
        <section className="panel fin">
          <div className="fin-head"><h2>{t('bs.owns')} <Help k="bs" more="accounts" /></h2><span className="muted small">{dayLabel(asOf, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
          <table className="tbl fin-tbl"><tbody>
            {line('cash', bs.assets.cash)}{line('bank', bs.assets.bank)}{line('receivable', bs.assets.receivable, t('bs.receivableHint'))}
            {line('supplierCredit', bs.assets.supplierCredit)}{line('peopleOwe', bs.assets.peopleOwe)}
            <tr className="fin-net"><td>{t('bs.totalOwns')}</td><td className="num">{fmt(bs.totalAssets)}</td></tr>
          </tbody></table>
        </section>
        <section className="panel fin">
          <div className="fin-head"><h2>{t('bs.owes')}</h2></div>
          <table className="tbl fin-tbl"><tbody>
            {line('payable', bs.liabilities.payable)}{line('bills', bs.liabilities.bills)}{line('owedPeople', bs.liabilities.owedPeople, t('bs.owedPeopleHint'))}
            {line('customerCredit', bs.liabilities.customerCredit)}{line('tax', bs.liabilities.tax)}
            {!bs.totalLiab && <tr><td className="muted">{t('bs.noDebts')}</td><td /></tr>}
            <tr className="fin-sum"><td>{t('bs.totalOwes')}</td><td className="num">{fmt(bs.totalLiab)}</td></tr>
            <tr className="fin-sec"><td colSpan={2}>{t('bs.net')}</td></tr>
            {line('opening', bs.equity.opening)}{line('earnings', bs.equity.earnings, t('bs.earningsHint'))}{line('adjust', bs.equity.adjust)}
            <tr className="fin-net"><td>{t('bs.totalNet')}</td><td className="num">{fmt(bs.totalEquity)}</td></tr>
          </tbody></table>
        </section>
      </div>
      <div className={`note ${bs.balanced ? 'info' : 'bad'}`}><Icon name={bs.balanced ? 'check' : 'alert'} size={16} />{bs.balanced ? t('bs.balanced') : t('bs.notBalanced')}</div>
    </>
  );
}

/* ───────────── Aging ───────────── */
function Aging() {
  const { farm, snap, t, fmt, today, nav, names } = useApp();
  const [side, setSide] = useState('ar');
  const data = useMemo(() => (side === 'ar' ? receivablesAging(farm, snap, { today, termsDays: farm.settings.termsDays }) : payablesAging(farm, snap, { today })), [farm, snap, side, today]);
  const exportCSV = () => downloadText(`aging-${side}-${today}.csv`, toCSV([
    [t('name'), ...BUCKETS.map((b) => t(`ag.${b}`)), t('total')],
    ...data.rows.map((r) => [r.name || t('ag.otherBills'), ...BUCKETS.map((b) => r[b] / 100), r.total / 100]),
    [t('total'), ...BUCKETS.map((b) => data.totals[b] / 100), data.totals.total / 100],
  ]));
  const max = Math.max(1, ...BUCKETS.map((b) => data.totals[b]));
  return (
    <>
      <div className="aging-top">
        <Seg value={side} onChange={setSide} options={[{ value: 'ar', label: t('ag.ar') }, { value: 'ap', label: t('ag.ap') }]} />
        <Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>
      </div>
      <section className="aging-buckets">
        {BUCKETS.map((b) => (
          <div key={b} className={`ab ab-${b}`}>
            <span className="ab-label">{t(`ag.${b}`)}</span>
            <b className="num">{fmt(data.totals[b])}</b>
            <span className="ab-bar"><span style={{ inlineSize: `${(data.totals[b] / max) * 100}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="fin-head"><h2>{side === 'ar' ? t('ag.arTitle') : t('ag.apTitle')} <Help k="aging" /></h2><span className="muted small">{t('ag.total')}: <b className="num">{fmt(data.totals.total)}</b></span></div>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl aging-tbl">
              <thead><tr><th>{side === 'ar' ? t('sale.customer') : t('exp.supplier')}</th>{BUCKETS.map((b) => <th key={b} className={`num ab-h-${b}`}>{t(`ag.${b}`)}</th>)}<th className="num">{t('total')}</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => (r.kind === 'bills' ? nav('expenses', null, 'open') : nav(side === 'ar' ? 'sales' : 'suppliers', r.id))}>
                    <td><b>{r.name || t('ag.otherBills')}</b></td>
                    {BUCKETS.map((b) => <td key={b} className={`num ${r[b] ? `ab-v-${b}` : 'muted'}`}>{r[b] ? fmt(r[b]) : '—'}</td>)}
                    <td className="num"><b>{fmt(r.total)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>{t('total')}</td>{BUCKETS.map((b) => <td key={b} className="num">{fmt(data.totals[b])}</td>)}<td className="num">{fmt(data.totals.total)}</td></tr></tfoot>
            </table>
          </div>
        ) : <Empty title={side === 'ar' ? t('ag.noneAr') : t('ag.noneAp')} icon="check" />}
        <p className="muted small">{side === 'ar' ? t('ag.arHint', { n: farm.settings.termsDays ?? 30 }) : t('ag.apHint')}</p>
      </section>
    </>
  );
}

/* ───────────── Journal & trial balance ───────────── */
function Journal() {
  const app = useApp();
  const { farm, t, fmt, lang, ui, names } = app;
  const per = usePeriod('month');
  const [view, setView] = useState('journal');
  const label = useAcctLabel();
  const party = (p, acct) => {
    if (!p) return '';
    const k = acct.split(':')[0];
    return k === 'ar' ? (p === 'walkin' ? t('sale.walkin') : names.customer(p)) : k === 'ap' ? names.supplier(p) : k === 'owed' ? names.person(p) : '';
  };
  const entries = useMemo(() => journal(farm, per.range).reverse(), [farm, per.range]);
  const tb = useMemo(() => trialBalance(farm, { to: per.range.to }), [farm, per.range.to]);
  const [limit, setLimit] = useState(60);
  const exportCSV = () => downloadText(`journal-${per.range.from}.csv`, toCSV([[t('date'), t('acc.number'), t('acc.type'), t('acc.account'), t('acc.party'), t('acc.debit'), t('acc.credit')],
    ...journalRows(farm, { ...per.range, label, party, number: (e) => (e.record ? docNo(e.record, farm.settings) : '') })]));
  const exportTB = () => downloadText(`trial-balance-${per.range.to}.csv`, toCSV([[t('acc.account'), t('acc.debit'), t('acc.credit')], ...tb.rows.map((r) => [label(r.acct), r.balance > 0 ? r.balance / 100 : '', r.balance < 0 ? -r.balance / 100 : '']), [t('total'), tb.rows.reduce((a, r) => a + Math.max(0, r.balance), 0) / 100, tb.rows.reduce((a, r) => a + Math.max(0, -r.balance), 0) / 100]]));
  const tbDr = tb.rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const tbCr = tb.rows.reduce((a, r) => a + Math.max(0, -r.balance), 0);
  return (
    <>
      <div className="aging-top">
        <Seg value={view} onChange={setView} options={[{ value: 'journal', label: t('acc.journal') }, { value: 'tb', label: t('acc.tb') }]} />
        <Button size="sm" icon="download" onClick={view === 'journal' ? exportCSV : exportTB}>{t('rep.csv')}</Button>
      </div>
      <FilterPanel id="journal" onReset={per.reset} chips={[{ label: per.label, active: !per.isDefault }]}>
        <PeriodBarLite per={per} />
      </FilterPanel>
      {view === 'journal' ? (
        <section className="panel">
          <p className="muted small">{t('acc.journalHint')} <Help k="journal" /></p>
          {entries.length ? entries.slice(0, limit).map((e) => (
            <div key={e.id} className="je">
              <button type="button" className="je-head" onClick={() => e.record && ui.open('drawer', { id: e.id })} disabled={!e.record}>
                <span className="je-date num">{e.day.startsWith('0000') ? '—' : dayLabel(e.day, lang)}</span>
                {e.record?.no && <span className="row-no num">{docNo(e.record, farm.settings)}</span>}
                <span className="je-type">{e.type === 'opening' ? t('cash.opening') : t(`t.${e.type}`)}</span>
                <span className="je-party muted">{party(e.lines.find((l) => l.party)?.party, e.lines.find((l) => l.party)?.acct || '')}</span>
              </button>
              <table className="je-lines"><tbody>
                {e.lines.map((l, i) => (
                  <tr key={i} className={l.cr ? 'is-cr' : ''}>
                    <td>{label(l.acct)}</td>
                    <td className="num">{l.dr ? fmt(l.dr) : ''}</td>
                    <td className="num">{l.cr ? fmt(l.cr) : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )) : <Empty title={t('cash.empty')} icon="ledger" />}
          {entries.length > limit && <Button className="more-btn" onClick={() => setLimit(limit + 60)}>{t('more')} ({entries.length - limit})</Button>}
        </section>
      ) : (
        <section className="panel fin">
          <div className="fin-head"><h2>{t('acc.tb')}</h2><span className="muted small">{t('acc.upTo', { d: per.range.to.startsWith('9999') ? t('today') : dayLabel(per.range.to, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span></div>
          <div className="table-wrap">
            <table className="tbl fin-tbl">
              <thead><tr><th>{t('acc.account')}</th><th className="num">{t('acc.debit')}</th><th className="num">{t('acc.credit')}</th></tr></thead>
              <tbody>
                {['asset', 'liability', 'equity', 'income', 'expense'].map((ty) => {
                  const rows = tb.rows.filter((r) => r.type === ty && r.balance);
                  if (!rows.length) return null;
                  return (
                    <React.Fragment key={ty}>
                      <tr className="fin-grp"><td colSpan={3}>{t(`acc.t.${ty}`)}</td></tr>
                      {rows.map((r) => <tr key={r.acct} className="fin-sub"><td>{label(r.acct)}</td><td className="num">{r.balance > 0 ? fmt(r.balance) : ''}</td><td className="num">{r.balance < 0 ? fmt(-r.balance) : ''}</td></tr>)}
                    </React.Fragment>
                  );
                })}
                <tr className="fin-net"><td>{t('total')}</td><td className="num">{fmt(tbDr)}</td><td className="num">{fmt(tbCr)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className={`note ${tbDr === tbCr ? 'info' : 'bad'}`}><Icon name={tbDr === tbCr ? 'check' : 'alert'} size={16} />{tbDr === tbCr ? t('acc.tbOk') : t('acc.tbBad')}</div>
        </section>
      )}
    </>
  );
}

/* ───────────── Tax ───────────── */
function Tax() {
  const { farm, t, fmt, lang, nav } = useApp();
  const per = usePeriod('year');
  const ts = useMemo(() => taxSummary(farm, per.range), [farm, per.range]);
  const s = farm.settings;
  return (
    <>
      <FilterPanel id="tax" onReset={per.reset} chips={[{ label: per.label, active: !per.isDefault }]}><PeriodBarLite per={per} /></FilterPanel>
      {!s.tax.enabled && <div className="note info"><Icon name="alert" size={16} />{t('tax.off')} <button type="button" className="link" onClick={() => nav('options')}>{t('nav.settings')}</button></div>}
      <section className="stats-row">
        <Stat label={t('tax.collected')} value={fmt(ts.taxC)} />
        <Stat label={t('tax.taxable')} value={fmt(ts.netC)} />
        <Stat label={t('tax.invoices')} value={String(ts.count)} />
      </section>
      <section className="panel fin">
        <div className="fin-head"><h2>{lang === 'ar' ? s.tax.labelAr : s.tax.label} · {s.tax.rate}%</h2>{s.tax.number && <span className="muted small">{t('set.taxNumber')}: {s.tax.number}</span>}</div>
        {ts.months.length ? (
          <table className="tbl fin-tbl">
            <thead><tr><th>{t('tax.month')}</th><th className="num">{t('tax.invoices')}</th><th className="num">{t('tax.taxable')}</th><th className="num">{t('tax.collected')}</th></tr></thead>
            <tbody>{ts.months.map((m) => <tr key={m.month}><td>{monthLabel(m.month, lang)}</td><td className="num">{m.count}</td><td className="num">{fmt(m.netC)}</td><td className="num"><b>{fmt(m.taxC)}</b></td></tr>)}
              <tr className="fin-net"><td>{t('total')}</td><td className="num">{ts.count}</td><td className="num">{fmt(ts.netC)}</td><td className="num">{fmt(ts.taxC)}</td></tr></tbody>
          </table>
        ) : <Empty title={t('tax.none')} icon="file" />}
      </section>
    </>
  );
}

export function AccountsScreen() {
  const { route, nav, t, farm } = useApp();
  const showTax = farm.settings.tax.enabled || farm.records.some((r) => r.taxC);
  const tabs = [{ value: 'pl', label: t('acc.pl') }, { value: 'bs', label: t('acc.bs') }, { value: 'aging', label: t('acc.aging') }, { value: 'journal', label: t('acc.journal') }, ...(showTax ? [{ value: 'tax', label: t('acc.tax') }] : [])];
  const tab = tabs.some((x) => x.value === route.tab) ? route.tab : 'pl';
  return (
    <div className="screen">
      <PageHead title={t('nav.accounts')} sub={t('acc.sub')} />
      <Tabs value={tab} onChange={(x) => nav('accounts', null, x)} tabs={tabs} />
      {tab === 'pl' && <ProfitLoss />}
      {tab === 'bs' && <BalanceSheet />}
      {tab === 'aging' && <Aging />}
      {tab === 'journal' && <Journal />}
      {tab === 'tax' && <Tax />}
    </div>
  );
}

/* ───────────── Invoice register (Sales → Invoices) ───────────── */
export function InvoiceRegister() {
  const { farm, snap, t, fmt, today, lang, ui, names, nav } = useApp();
  const per = usePeriod('month');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const all = useMemo(() => invoiceRegister(farm, snap, { today, termsDays: farm.settings.termsDays, ...per.range }), [farm, snap, today, per.range]);
  const rows = all.filter((r) => (status === 'all' || (status === 'open' ? r.dueC > 0 : r.status === status))
    && (!q || `${docNo(r.sale, farm.settings)} ${names.customer(r.customerId)}`.toLowerCase().includes(q.toLowerCase())));
  const sum = (f) => all.filter((r) => r.status !== 'voided').reduce((a, r) => a + f(r), 0);
  const overdueC = all.filter((r) => r.status === 'overdue').reduce((a, r) => a + r.dueC, 0);
  const exportCSV = () => downloadText(`invoices-${per.range.from}.csv`, toCSV([[t('doc.invoiceNo'), t('doc.issued'), t('doc.due'), t('sale.customer'), t('total'), t('doc.paidToDate'), t('doc.balanceDue'), t('status')],
    ...rows.map((r) => [docNo(r.sale, farm.settings), r.day, r.customerId ? r.dueDay : '', names.customer(r.customerId), r.totalC / 100, r.paidC / 100, r.dueC / 100, t(`st.${r.status}`)])]));
  return (
    <>
      <section className="stats-row">
        <Stat label={t('inv.invoiced')} value={fmt(sum((r) => r.totalC))} sub={t('inv.count', { n: all.filter((r) => r.status !== 'voided').length })} />
        <Stat label={t('inv.collected')} value={fmt(sum((r) => r.paidC))} />
        <Stat label={t('inv.outstanding')} value={fmt(sum((r) => r.dueC))} onClick={() => setStatus('open')} />
        <Stat label={t('st.overdue')} value={fmt(overdueC)} tone={overdueC ? 'out' : null} onClick={() => setStatus('overdue')} />
      </section>
      <section className="panel">
        <FilterPanel id="invoices" onReset={() => { per.reset(); setStatus('all'); setQ(''); }} extra={<Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>}
          chips={[{ label: per.label, active: !per.isDefault }, status !== 'all' && { label: t(status === 'open' ? 'inv.open' : `st.${status}`), active: true }, q && { label: `“${q}”`, active: true }]}>
          <PeriodBarLite per={per} />
          <div className="filter-row">
            <input className="input search" placeholder={t('inv.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
            <Seg small label={t('status')} value={status} onChange={setStatus} options={['all', 'open', 'overdue', 'partial', 'paid', 'voided'].map((k) => ({ value: k, label: k === 'all' ? t('all') : k === 'open' ? t('inv.open') : t(`st.${k}`) }))} />
          </div>
        </FilterPanel>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl inv-tbl">
              <thead><tr><th>{t('doc.invoiceNo')}</th><th>{t('sale.customer')}</th><th>{t('doc.issued')}</th><th>{t('doc.due')}</th><th className="num">{t('total')}</th><th className="num">{t('doc.balanceDue')}</th><th>{t('status')}</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.sale.id} className={`clickable ${r.status === 'voided' ? 'is-void' : ''}`} onClick={() => ui.open('drawer', { id: r.sale.id })}>
                    <td className="num"><b>{docNo(r.sale, farm.settings)}</b></td>
                    <td>{r.customerId ? names.customer(r.customerId) : <span className="muted">{t('sale.walkin')}</span>}</td>
                    <td className="num">{dayLabel(r.day, lang)}</td>
                    <td className={`num ${r.status === 'overdue' ? 'out' : ''}`}>{r.customerId && r.dueC > 0 ? dayLabel(r.dueDay, lang) : '—'}</td>
                    <td className="num">{fmt(r.totalC)}</td>
                    <td className="num">{r.dueC ? <b>{fmt(r.dueC)}</b> : '—'}</td>
                    <td><Pill status={r.status}>{t(`st.${r.status}`)}</Pill></td>
                    <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" icon="print" onClick={() => ui.open('doc', { kind: r.customerId ? 'invoice' : 'receipt', id: r.sale.id })} aria-label={t('print')} />
                      {r.dueC > 0 && <Button size="sm" icon="cash" onClick={() => ui.open('payment', { customerId: r.customerId })}>{t('inv.collect')}</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && <Button className="more-btn" onClick={() => setLimit(limit + 100)}>{t('more')} ({rows.length - limit})</Button>}
          </div>
        ) : <Empty title={t('sales.noSales')} icon="file" action={<Button variant="primary" onClick={() => ui.open('sale')}>{t('new.sale')}</Button>} />}
      </section>
    </>
  );
}
