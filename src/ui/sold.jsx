import React, { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Seg, DateInput, FilterPanel, dayLabel } from './kit.jsx';
import { usePeriod, downloadText } from './screens-money.jsx';
import { animalSaleInfo, soldRegister } from '../core/animals.mjs';
import { invoiceRegister, docNo } from '../core/accounts.mjs';
import { SPECIES } from '../core/species.mjs';
import { fmtQty } from '../core/money.mjs';
import { toCSV } from '../core/reports.mjs';
import { Help } from './help.jsx';

/** Age as years and months, or days when young. */
export function useAge() {
  const { t } = useApp();
  return (days) => {
    if (days == null || days < 0) return '—';
    if (days < 60) return t('age.days', { n: days });
    const m = Math.floor(days / 30.44);
    const y = Math.floor(m / 12);
    if (!y) return t('age.months', { n: m });
    return m % 12 ? t('age.ym', { y, m: m % 12 }) : t('age.years', { n: y });
  };
}

const buyerName = (info, names, t) => (info.customerId ? names.customer(info.customerId) : info.buyer || t('sale.walkin'));

/** The sale record shown at the top of a sold animal's page. */
export function SaleRecordPanel({ a }) {
  const { farm, snap, t, fmt, lang, ui, nav, names, today } = useApp();
  const info = useMemo(() => animalSaleInfo(farm, a), [farm, a]);
  const inv = useMemo(() => (info?.sale ? invoiceRegister(farm, snap, { today, termsDays: farm.settings.termsDays }).find((r) => r.sale.id === info.sale.id) : null), [farm, snap, info, today]);
  const age = useAge();
  if (!info) return null;
  const flock = SPECIES[a.species].mode === 'flock';
  const row = (k, v, cls = '') => (v == null || v === '' ? null : <div className={`sr-item ${cls}`}><dt>{k}</dt><dd>{v}</dd></div>);
  return (
    <section className="panel sale-record">
      <div className="sr-head">
        <div>
          <span className="sr-kicker"><Icon name="lock" size={14} />{t('sold.kept')}</span>
          <h2>{t('sold.record')} <Help k="saleRecord" /></h2>
        </div>
        <div className="sr-actions">
          {info.sale && <Button size="sm" icon="print" onClick={() => ui.open('doc', { kind: info.sale.customerId ? 'invoice' : 'receipt', id: info.sale.id })}>{t('print')}</Button>}
          {info.sale && <Button size="sm" icon="file" onClick={() => ui.open('drawer', { id: info.sale.id })}>{t('sold.openSale')}</Button>}
          {!info.sale && <Button size="sm" icon="edit" onClick={() => ui.open('animal', { record: a })}>{t('edit')}</Button>}
        </div>
      </div>
      <div className="sr-price">
        <div>
          <span className="muted small">{t('sold.price')}</span>
          <b className="num">{fmt(info.priceC)}</b>
        </div>
        <div className={`sr-gain ${info.gainC >= 0 ? 'in' : 'out'}`}>
          <span className="muted small">{info.purchaseC ? t('sold.gain') : t('sold.netOfCosts')}</span>
          <b className="num">{info.gainC >= 0 ? '+' : '−'}{fmt(Math.abs(info.gainC))}</b>
        </div>
        {inv && <Pill status={inv.status}>{t(`st.${inv.status}`)}{inv.dueC > 0 ? ` · ${fmt(inv.dueC)}` : ''}</Pill>}
      </div>
      <dl className="sr-grid">
        {row(t('sold.date'), info.day ? dayLabel(info.day, lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '—')}
        {row(t('sold.buyer'), info.customerId ? <button type="button" className="link" onClick={() => nav('sales', info.customerId)}>{names.customer(info.customerId)}</button> : buyerName(info, names, t))}
        {row(t('doc.invoiceNo'), info.no ? <span className="num">{docNo({ type: 'sale', no: info.no }, farm.settings)}</span> : null)}
        {!flock && row(t('sold.weight'), info.weightKg ? `${fmtQty(info.weightKg)} ${t('u.kg')}` : null)}
        {!flock && info.weightKg > 0 && info.priceC > 0 && row(t('sold.perKg'), fmt(Math.round(info.priceC / info.weightKg)))}
        {flock && row(t('ani.birds'), info.birds)}
        {!flock && row(t('sold.age'), info.ageDays != null ? age(info.ageDays) : null)}
        {row(t('sold.onFarm'), info.daysOnFarm != null ? age(info.daysOnFarm) : null)}
        {row(t('sold.purchase'), info.purchaseC ? fmt(info.purchaseC) : null)}
        {row(t('sold.treatments'), info.treatments ? `${fmt(info.treatC)} · ${t('sold.nTreat', { n: info.treatments })}` : null)}
        {SPECIES[a.species].product === 'milk' && row(t('sold.milk'), info.milkL ? `${fmtQty(info.milkL)} ${t('u.L')}` : null)}
        {flock && row(t('sold.eggs'), info.eggs ? fmtQty(info.eggs) : null)}
        {row(t('sold.births'), info.births || null)}
        {row(t('sold.prevStatus'), a.prevStatus ? t(`as.${a.prevStatus}`) : null)}
        {row(t('note'), info.note || info.sale?.note || null, 'wide')}
      </dl>
      {info.voided && <div className="note warn"><Icon name="alert" size={16} />{t('sold.voidedNote')}</div>}
      {!info.sale && !info.voided && <p className="muted small">{t('sold.manualNote')}</p>}
    </section>
  );
}

/** Animals → Sold: every animal that left by sale, with its full record. */
export function SoldRegister() {
  const { farm, t, fmt, lang, nav, names } = useApp();
  const per = usePeriod('all');
  const [sp, setSp] = useState('');
  const [q, setQ] = useState('');
  const age = useAge();
  const all = useMemo(() => soldRegister(farm), [farm]);
  const rows = all.filter(({ a, info }) => (!sp || a.species === sp)
    && (!info.day || (info.day >= per.range.from && info.day <= per.range.to))
    && (!q || `${a.tag} ${a.name} ${a.breed} ${buyerName(info, names, t)}`.toLowerCase().includes(q.toLowerCase())));
  const total = rows.reduce((s, r) => s + r.info.priceC, 0);
  const gain = rows.reduce((s, r) => s + r.info.gainC, 0);
  const heads = rows.reduce((s, r) => s + (SPECIES[r.a.species].mode === 'flock' ? 0 : 1), 0);
  const exportCSV = () => downloadText(`sold-animals-${per.range.from.startsWith('0000') ? 'all' : per.range.from}.csv`, toCSV([
    [t('ani.tag'), t('ani.name'), t('prod.species'), t('ani.breed'), t('sold.date'), t('sold.buyer'), t('doc.invoiceNo'), t('sold.weight'), t('sold.age'), t('sold.onFarm'), t('sold.purchase'), t('sold.treatments'), t('sold.price'), t('sold.gain')],
    ...rows.map(({ a, info }) => [a.tag, a.name || '', t(`sp.${a.species}`), a.breed || '', info.day || '', buyerName(info, names, t), info.no ? docNo({ type: 'sale', no: info.no }, farm.settings) : '', info.weightKg || '', info.ageDays ?? '', info.daysOnFarm ?? '', info.purchaseC / 100, info.treatC / 100, info.priceC / 100, info.gainC / 100]),
  ]));
  return (
    <>
      <section className="stats-row">
        <Stat label={t('sold.count')} value={String(rows.length)} sub={heads !== rows.length ? t('sold.heads', { n: heads }) : null} />
        <Stat label={t('sold.total')} value={fmt(total)} />
        <Stat label={t('sold.avg')} value={rows.length ? fmt(Math.round(total / rows.length)) : '—'} />
        <Stat label={t('sold.totalGain')} value={fmt(gain)} tone={gain >= 0 ? 'in' : 'out'} />
      </section>
      <section className="panel">
        <FilterPanel id="sold" onReset={() => { per.reset(); setSp(''); setQ(''); }} extra={<Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>}
          chips={[{ label: per.label, active: !per.isDefault }, sp && { label: t(`sp.${sp}`), active: true }, q && { label: `“${q}”`, active: true }]}>
          <div className="period-bar">
            <Seg small wrap value={per.p} onChange={per.onChange} options={['month', 'lastMonth', 'year', 'all', 'custom'].map((p) => ({ value: p, label: t(`p.${p}`) }))} />
            {per.p === 'custom' && (
              <div className="grid2 tight">
                <DateInput label={t('from')} value={per.range.from} onChange={(v) => per.setRange({ ...per.range, from: v })} />
                <DateInput label={t('to')} value={per.range.to} onChange={(v) => per.setRange({ ...per.range, to: v })} />
              </div>
            )}
          </div>
          <div className="filter-row">
            <input className="input search" placeholder={t('sold.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
            <Seg small label={t('prod.species')} value={sp} onChange={setSp} options={[{ value: '', label: t('all') }, ...Object.keys(SPECIES).map((s) => ({ value: s, label: t(`sp.${s}`) }))]} />
          </div>
        </FilterPanel>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl sold-tbl">
              <thead><tr><th>{t('ani.tag')}</th><th>{t('sold.date')}</th><th>{t('sold.buyer')}</th><th className="num">{t('sold.weight')}</th><th>{t('sold.age')}</th><th className="num">{t('sold.price')}</th><th className="num">{t('sold.gain')}</th></tr></thead>
              <tbody>
                {rows.map(({ a, info }) => (
                  <tr key={a.id} className="clickable" onClick={() => nav('animals', a.id)}>
                    <td><b className="num">{a.tag}</b>{a.name && <span className="muted"> · {a.name}</span>}<div className="muted small">{[t(`sp.${a.species}`), a.breed].filter(Boolean).join(' · ')}{a.archived ? ` · ${t('archived')}` : ''}</div></td>
                    <td className="num">{info.day ? dayLabel(info.day, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}{info.no && <div className="muted small">{docNo({ type: 'sale', no: info.no }, farm.settings)}</div>}</td>
                    <td>{buyerName(info, names, t)}</td>
                    <td className="num">{SPECIES[a.species].mode === 'flock' ? `${info.birds || '—'}` : info.weightKg ? `${fmtQty(info.weightKg)} ${t('u.kg')}` : '—'}</td>
                    <td>{SPECIES[a.species].mode === 'flock' ? '—' : age(info.ageDays)}</td>
                    <td className="num"><b>{fmt(info.priceC)}</b></td>
                    <td className={`num ${info.gainC >= 0 ? 'in' : 'out'}`}>{info.gainC >= 0 ? '+' : '−'}{fmt(Math.abs(info.gainC))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title={t('sold.none')} body={t('sold.noneHint')} icon="cow" />}
        <p className="muted small">{t('sold.gainHint')}</p>
      </section>
    </>
  );
}
