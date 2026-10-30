import React, { useMemo, useState } from 'react';
import { milkQ, milkN } from './units.js';
import { useApp, useDraft } from './store.jsx';
import { Button, Icon, MoneyInput, QtyInput, DateInput, Seg, Select, Picker, TextInput, TextArea, Check, Sheet, Field, readImage, IconButton } from './kit.jsx';
import { TxFooter, issuesFor } from './tx.jsx';
import { saleTotals, offsetsC, supplierBills, invoiceDueDay } from '../core/ledger.mjs';
import { PRODUCTS, EXPENSE_GROUPS, CATEGORY_UNIT, CATEGORY_ICON, OFFSET_TYPES, MEDICINE_KINDS, MEDICINE_SUGGEST, MILK_USE_REASONS, PERSON_PURPOSES, OUT_OF_POCKET_CATEGORIES, groupOf } from '../core/catalog.mjs';
import { validateRecord } from '../core/validate.mjs';
import { deleteRecords, upsert } from '../core/commands.mjs';
import { litresOf, saleMilkL } from '../core/milk.mjs';
import { fmtQty } from '../core/money.mjs';
import { SPECIES } from '../core/species.mjs';

const strip = ({ id, createdAt, createdBy, createdByName, updatedAt, updatedBy, history, deletedAt, ...rest }) => rest;
const opts = (list, t, prefix) => list.map((v) => ({ value: v, label: t(`${prefix}${v}`) }));

function useParties(keepAnimal) {
  const { farm, t, snap, fmt } = useApp();
  return useMemo(() => ({
    customers: farm.customers.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, sub: snap.cust[c.id]?.dueC ? `${t('cust.due')} ${fmt(snap.cust[c.id].dueC)}` : c.phone })),
    suppliers: farm.suppliers.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, sub: snap.sup[c.id]?.dueC ? `${t('st.owing')} ${fmt(snap.sup[c.id].dueC)}` : '' })),
    people: farm.people.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name })),
    animals: farm.animals.filter((a) => !a.deletedAt && (a.id === keepAnimal || !['sold', 'dead'].includes(a.status))).map((a) => ({ value: a.id, label: a.name ? `${a.name} · ${a.tag}` : a.tag, sub: t(`sp.${a.species}`), species: a.species })),
  }), [farm, snap, t, fmt, keepAnimal]);
}

/* ───────────── Sale / cashier ───────────── */
export function SaleSheet({ record, customerId: presetCustomer, animalId: presetAnimal, onClose }) {
  const app = useApp();
  const { farm, t, fmt, today, snap, ui } = app;
  const parties = useParties(record?.animalId);
  const s = farm.settings;
  const blankLine = (cid) => {
    const c = farm.customers.find((x) => x.id === cid);
    return { product: c?.defaultProduct || 'milk', qty: c?.defaultQty || 0, unit: s.milkUnit === 'kg' ? 'kg' : 'L', priceC: c?.defaultPriceC || s.milkPriceC, direct: false, amountC: 0 };
  };
  const init = record ? {
    day: record.day, customerId: record.customerId || '', lines: record.lines, discKind: record.discount?.kind || 'amount', discValueC: record.discount?.valueC || 0,
    discPct: record.discount?.value || 0, discReason: record.discount?.reason || '', method: record.method || 'cash', paidNowC: record.paidNowC || 0,
    tenderC: record.tenderC || 0, payMode: record.customerId ? (record.paidNowC >= record.totalC ? 'full' : record.paidNowC > 0 ? 'part' : 'none') : 'full', note: record.note || '', animalId: record.animalId || '', dueDay: record.dueDay || '',
  } : { day: today, customerId: presetCustomer || '', lines: [presetAnimal ? { product: 'animal', qty: 1, unit: 'head', priceC: 0, direct: false, amountC: 0 } : blankLine(presetCustomer)], discKind: 'amount', discValueC: 0, discPct: 0, discReason: '', method: 'cash', paidNowC: 0, tenderC: 0, payMode: presetCustomer ? 'none' : 'full', note: '', animalId: presetAnimal || '', dueDay: '' };
  const [f, setF, clearDraft, restored] = useDraft(`sale:${presetCustomer || ''}:${presetAnimal || ''}`, init, !record && !presetAnimal);
  const [done, setDone] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setLine = (i, p) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const walkin = !f.customerId;
  const discount = f.discKind === 'percent' ? { kind: 'percent', value: Number(f.discPct) || 0, reason: f.discReason } : { kind: 'amount', valueC: f.discValueC, reason: f.discReason };
  const tot = saleTotals({ lines: f.lines, discount }, s.tax);
  const paidNowC = walkin ? tot.totalC : f.payMode === 'full' ? tot.totalC : f.payMode === 'none' ? 0 : f.paidNowC;
  const tenderC = walkin && f.method === 'cash' ? (f.tenderC || tot.totalC) : null;
  const rec = {
    type: 'sale', day: f.day, customerId: f.customerId || null,
    lines: f.lines.map((l, i) => ({ ...l, amountC: tot.lineAmounts[i] })),
    discount, discountC: tot.discountC, taxC: tot.taxC, totalC: tot.totalC,
    paidNowC, tenderC, method: f.method, note: f.note, dueDay: f.customerId && paidNowC < tot.totalC ? (f.dueDay || invoiceDueDay({ day: f.day }, s.termsDays)) : null, animalId: f.lines.some((l) => l.product === 'animal') ? f.animalId || null : null,
  };
  const issues = validateRecord(rec, { today, tax: s.tax });
  const ownMilk = record ? saleMilkL(record) : 0;
  const tank = snap.milk.stockL + (record && !record.voided ? ownMilk : 0);
  const change = tenderC != null ? tenderC - tot.totalC : 0;
  const denoms = [500, 1000, 2000, 5000, 10000].filter((d) => d >= tot.totalC).slice(0, 3);
  const chips = [{ label: t('sale.exact'), cents: tot.totalC }, ...denoms.map((d) => ({ label: fmt(d), cents: d }))];

  if (done) {
    return (
      <Sheet title={t('sale.success')} onClose={onClose}>
        <div className="success">
          <div className="success-check"><Icon name="check" size={36} /></div>
          <div className="success-amt num">{fmt(done.totalC)}</div>
          {done.change > 0 && <div className="success-change">{t('sale.change')}: <b className="num">{fmt(done.change)}</b></div>}
          <div className="foot-btns center">
            <Button onClick={() => ui.open('doc', { kind: 'receipt', id: done.id })} icon="print">{t('sale.receipt')}</Button>
            <Button variant="primary" onClick={() => { setDone(null); clearDraft(); }} autoFocus>{t('sale.nextSale')}</Button>
          </div>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={record ? t('sale.edit') : t('sale.title')} onClose={onClose} wide
      footer={<TxFooter recs={[rec]} editing={record} ctx={{}} onSaved={(next) => {
        if (!record) { const last = next.records[next.records.length - 1]; if (walkin) setDone({ totalC: tot.totalC, change, id: last.id }); }
      }} onDone={(m) => { if (record) return onClose(); clearDraft(); if (m === 'close' && !walkin) onClose(); }} />}>
      {restored && <div className="note info">{t('ed.draft')} <button type="button" className="link" onClick={clearDraft}>{t('ed.discard')}</button></div>}
      <div className="grid2">
        <Picker label={t('sale.customer')} value={f.customerId} onChange={(v) => set({ customerId: v, payMode: v ? 'none' : 'full', lines: f.lines.length === 1 && !f.lines[0].qty ? [blankLine(v)] : f.lines })} options={parties.customers} allowEmpty={t('sale.walkin')} placeholder={t('sale.walkin')} />
        <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} error={issuesFor(issues, 'day', t)} />
      </div>
      <div className="lines">
        {f.lines.map((l, i) => {
          const isMilk = l.product === 'milk';
          const short = isMilk && litresOf(l.qty, l.unit) > tank + 0.0005;
          return (
            <div className="line" key={i}>
              <Select label={t('sale.product')} value={l.product} onChange={(v) => setLine(i, { product: v, unit: v === 'milk' ? (s.milkUnit === 'kg' ? 'kg' : 'L') : PRODUCTS[v].unit, priceC: v === 'milk' ? s.milkPriceC : v === 'eggs' ? s.eggPriceC : l.priceC })} options={opts(Object.keys(PRODUCTS), t, 'pr.')} />
              {l.direct ? (
                <MoneyInput label={t('sale.direct')} cents={l.amountC} onCents={(c) => setLine(i, { amountC: c })} error={issuesFor(issues, `lines.${i}.amount`, t, l.amountC)} />
              ) : (
                <>
                  <QtyInput label={t('qty')} value={l.qty} onValue={(v) => setLine(i, { qty: v })} unit={isMilk ? null : t(`u.${l.unit}`)}
                    hint={isMilk ? t('sale.inStock', { l: `${milkQ(tank)}` }) : null}
                    error={short ? t('e.milk.oversell', { l: `${milkQ(litresOf(l.qty, l.unit) - tank)}` }) : issuesFor(issues, `lines.${i}.qty`, t, l.qty)} />
                  {isMilk && <Seg small value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={[{ value: 'L', label: t('u.L') }, { value: 'kg', label: t('u.kg') }]} />}
                  <MoneyInput label={`${t('price')} / ${t(`u.${l.unit}`)}`} cents={l.priceC} onCents={(c) => setLine(i, { priceC: c })} error={issuesFor(issues, `lines.${i}.price`, t, l.priceC)} />
                </>
              )}
              {l.product === 'animal' && <Picker label={t('sale.animal')} value={f.animalId} onChange={(v) => set({ animalId: v })} options={parties.animals} allowEmpty={t('none')} />}
              <div className="line-foot">
                <button type="button" className="link" onClick={() => setLine(i, { direct: !l.direct, amountC: tot.lineAmounts[i] })}>{l.direct ? `${t('qty')} × ${t('price')}` : t('sale.direct')}</button>
                <span className="num line-amt">{fmt(tot.lineAmounts[i] || 0)}</span>
                {f.lines.length > 1 && <IconButton icon="trash" label={t('delete')} onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })} />}
              </div>
            </div>
          );
        })}
        <Button icon="plus" size="sm" onClick={() => set({ lines: [...f.lines, { ...blankLine(f.customerId), product: 'labneh', unit: 'kg', priceC: 0 }] })}>{t('sale.addLine')}</Button>
      </div>
      <details className="disc" open={!!(f.discValueC || f.discPct)}>
        <summary>{t('sale.discount')}</summary>
        <div className="grid3">
          <Seg small value={f.discKind} onChange={(v) => set({ discKind: v })} options={[{ value: 'amount', label: s.currency }, { value: 'percent', label: '%' }]} />
          {f.discKind === 'amount'
            ? <MoneyInput label={t('sale.discount')} cents={f.discValueC} onCents={(c) => set({ discValueC: c })} error={issuesFor(issues, 'discount', t)} />
            : <QtyInput label={t('sale.discount')} value={f.discPct} onValue={(v) => set({ discPct: v })} unit="%" error={issuesFor(issues, 'discount', t)} />}
          <TextInput label={t('sale.discountReason')} value={f.discReason} onChange={(v) => set({ discReason: v })} />
        </div>
      </details>
      <div className="totals">
        {tot.discountC > 0 && <div><span>{t('sale.gross')}</span><span className="num">{fmt(tot.grossC)}</span></div>}
        {tot.discountC > 0 && <div><span>{t('sale.discount')}</span><span className="num">−{fmt(tot.discountC)}</span></div>}
        {tot.taxC > 0 && <div><span>{s.tax.inclusive ? `${t('sale.tax')} (${s.tax.rate}%)` : `${t('sale.tax')} ${s.tax.rate}%`}</span><span className="num">{fmt(tot.taxC)}</span></div>}
        <div className="grand"><span>{t('sale.totalDue')}</span><span className="num">{fmt(tot.totalC)}</span></div>
      </div>
      {walkin ? (
        f.method === 'cash' && (
          <div className="cashier">
            <MoneyInput big label={t('sale.received')} cents={f.tenderC || tot.totalC} onCents={(c) => set({ tenderC: c })} chips={chips} keypad error={issuesFor(issues, 'tender', t)} />
            <div className={`change-box ${change < 0 ? 'short' : ''}`}><span>{t('sale.change')}</span><b className="num">{fmt(Math.max(0, change))}</b></div>
          </div>
        )
      ) : (
        <>
          <Seg value={f.payMode} onChange={(v) => set({ payMode: v })} options={[{ value: 'none', label: t('sale.payNone') }, { value: 'part', label: t('exp.payPart') }, { value: 'full', label: t('sale.payFull') }]} />
          {f.payMode === 'part' && <MoneyInput label={t('sale.payNow')} cents={f.paidNowC} onCents={(c) => set({ paidNowC: c })} error={issuesFor(issues, 'paidNow', t)} />}
          {tot.totalC - paidNowC > 0 && (
            <div className="grid2">
              <div className="due-line">{t('sale.remains')}: <b className="num">{fmt(tot.totalC - paidNowC)}</b></div>
              <DateInput label={t('doc.due')} value={f.dueDay || invoiceDueDay({ day: f.day }, s.termsDays)} min={f.day} onChange={(v) => set({ dueDay: v })} />
            </div>
          )}
        </>
      )}
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

/* ───────────── Customer payment ───────────── */
export function PaymentSheet({ record, customerId, keptBy: presetKept, onClose }) {
  const { farm, t, fmt, today, snap } = useApp();
  const parties = useParties();
  const init = record ? { day: record.day, customerId: record.customerId, cashC: record.cashC || 0, method: record.method || 'cash', keptBy: record.keptBy || '', offsets: record.offsets || [], allowCredit: !!record.allowCredit, note: record.note || '' }
    : { day: today, customerId: customerId || '', cashC: 0, method: 'cash', keptBy: presetKept || '', offsets: [], allowCredit: false, note: '' };
  const [f, setF, clearDraft, restored] = useDraft(`pay:${customerId || ''}`, init, !record);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const ownCredit = record ? (record.cashC || 0) + offsetsC(record) : 0;
  const dueBefore = (snap.cust[f.customerId]?.dueC || 0) + (record && record.customerId === f.customerId ? ownCredit : 0) - (record && record.customerId === f.customerId ? Math.min(ownCredit, snap.cust[f.customerId]?.creditBalC || 0) : 0);
  const rec = { type: 'payment', day: f.day, customerId: f.customerId, cashC: f.cashC, method: f.method, keptBy: f.keptBy || null, offsets: f.offsets, allowCredit: f.allowCredit, note: f.note };
  const total = f.cashC + offsetsC(rec);
  const issues = validateRecord(rec, { today, dueC: dueBefore });
  const setOff = (i, p) => set({ offsets: f.offsets.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  return (
    <Sheet title={record ? t('pay.edit') : t('pay.title')} onClose={onClose}
      footer={<TxFooter recs={[rec]} editing={record} ctx={{ dueC: dueBefore }} onDone={(m) => { clearDraft(); if (m === 'close' || record) onClose(); }} />}>
      {restored && <div className="note info">{t('ed.draft')} <button type="button" className="link" onClick={clearDraft}>{t('ed.discard')}</button></div>}
      <div className="grid2">
        <Picker label={t('sale.customer')} value={f.customerId} onChange={(v) => set({ customerId: v })} options={parties.customers} error={issuesFor(issues, 'customerId', t, f.cashC)} />
        <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
      </div>
      {f.customerId && <div className="due-line">{t('pay.dueNow', { a: '' })}<b className="num">{fmt(dueBefore)}</b></div>}
      <MoneyInput big autoFocus label={t('pay.cash')} cents={f.cashC} onCents={(c) => set({ cashC: c })} keypad
        chips={dueBefore > 0 ? [{ label: t('sale.payFull'), cents: Math.max(0, dueBefore - offsetsC(rec)) }] : []} error={issuesFor(issues, 'cash', t, f.cashC || f.offsets.length)} />
      <section className="sub-sec">
        <h3>{t('pay.offsets')}</h3>
        <p className="muted small">{t('pay.offsetHint')}</p>
        {f.offsets.map((o, i) => (
          <div className="grid3 offset" key={i}>
            <Select label={t('exp.item')} value={o.category} onChange={(v) => setOff(i, { category: v })} options={opts(OFFSET_TYPES, t, 'c.')} />
            <MoneyInput label={t('amount')} cents={o.amountC} onCents={(c) => setOff(i, { amountC: c })} error={issuesFor(issues, `offsets.${i}.amount`, t, o.amountC || o.desc)} />
            <TextInput label={t('note')} value={o.desc} onChange={(v) => setOff(i, { desc: v })} error={issuesFor(issues, `offsets.${i}.desc`, t, o.amountC || o.desc)} />
            <IconButton icon="trash" label={t('delete')} onClick={() => set({ offsets: f.offsets.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <Button size="sm" icon="plus" onClick={() => set({ offsets: [...f.offsets, { category: 'fuel', amountC: 0, desc: '' }] })}>{t('pay.addOffset')}</Button>
      </section>
      <Select label={t('pay.keptBy')} hint={t('pay.keptHint')} value={f.keptBy} onChange={(v) => set({ keptBy: v })} options={parties.people} placeholder={t('pay.inBox')} />
      {f.customerId && <div className="due-line">{t('pay.afterThis', { a: '' })}<b className="num">{fmt(Math.max(0, dueBefore - total))}</b>{total > dueBefore && <span className="pill pill-info">{t('st.credit')} {fmt(total - dueBefore)}</span>}</div>}
      {total > dueBefore && <Check label={t('pay.allowCredit')} checked={f.allowCredit} onChange={(v) => set({ allowCredit: v })} />}
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

/* ───────────── Expense ───────────── */
export function ExpenseSheet({ record, supplierId: presetSup, personId: presetPerson, category: presetCat, amountC: presetAmt, onClose, extraOp, workerId, payroll }) {
  const { farm, t, fmt, today, snap } = useApp();
  const parties = useParties();
  const custom = farm.settings.categories || [];
  const init = record ? {
    day: record.day, group: groupOf(record.category, custom), category: record.category, amountC: record.amountC,
    payMode: record.paidC >= record.amountC ? 'all' : record.paidC > 0 ? 'part' : 'none', paidC: record.paidC || 0, source: record.source || 'cash', personId: record.personId || '',
    supplierId: record.supplierId || '', vendor: record.vendor || '', qty: record.qty || 0, unit: record.unit || '', dueDay: record.dueDay || '', capital: !!record.capital, receipt: record.receipt || '', note: record.note || '',
  } : {
    day: today, group: presetCat ? groupOf(presetCat, custom) : '', category: presetCat || '', amountC: presetAmt || 0, payMode: presetSup ? 'none' : 'all', paidC: 0,
    source: presetPerson ? 'person' : 'cash', personId: presetPerson || '', supplierId: presetSup || '', vendor: '', qty: 0, unit: '', dueDay: '', capital: false, receipt: '', note: '',
  };
  const [f, setF, clearDraft, restored] = useDraft(`exp:${presetSup || ''}:${presetPerson || ''}:${presetCat || ''}`, init, !record && !presetAmt);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const paidC = f.source === 'person' ? f.amountC : f.payMode === 'all' ? f.amountC : f.payMode === 'none' ? 0 : f.paidC;
  const rec = {
    type: 'expense', day: f.day, category: f.category, amountC: f.amountC, paidC, source: f.source, personId: f.source === 'person' ? f.personId : null,
    supplierId: f.supplierId || null, vendor: f.vendor, qty: f.qty || null, unit: f.qty ? (f.unit || CATEGORY_UNIT[f.category] || 'item') : null,
    dueDay: f.dueDay || null, capital: f.capital, receipt: f.receipt || null, note: f.note, ...(workerId ? { workerId } : {}), ...(payroll || record?.payroll ? { payroll: true } : {}),
  };
  const issues = validateRecord(rec, { today });
  const groups = Object.keys(EXPENSE_GROUPS);
  const items = f.group ? [...EXPENSE_GROUPS[f.group], ...custom.filter((c) => c.group === f.group).map((c) => c.key)] : [];
  const catLabel = (k) => { const c = custom.find((x) => x.key === k); return c ? c.name : t(`c.${k}`); };
  const step = !f.group ? 1 : !f.category ? 2 : 3;
  return (
    <Sheet title={record ? t('exp.edit') : t('exp.title')} onClose={onClose} wide
      footer={step === 3 ? <TxFooter recs={[rec]} editing={record} extraOp={extraOp} onDone={(m) => { clearDraft(); if (m === 'close' || record) onClose(); else set({ amountC: 0, paidC: 0, note: '', vendor: '', qty: 0, receipt: '' }); }} /> : null}>
      {restored && <div className="note info">{t('ed.draft')} <button type="button" className="link" onClick={clearDraft}>{t('ed.discard')}</button></div>}
      <div className="crumbs">
        <button type="button" className={step === 1 ? 'on' : ''} onClick={() => set({ group: '', category: '' })}>{f.group ? t(`g.${f.group}`) : t('exp.group')}</button>
        {f.group && <><Icon name="chev" size={14} className="flip-rtl" /><button type="button" className={step === 2 ? 'on' : ''} onClick={() => set({ category: '' })}>{f.category ? catLabel(f.category) : t('exp.item')}</button></>}
      </div>
      {step === 1 && (
        <div className="tiles">
          {groups.map((g) => <button type="button" key={g} className="tile" onClick={() => set({ group: g })}><span className="tile-ico">{CATEGORY_ICON[EXPENSE_GROUPS[g][0]]}</span>{t(`g.${g}`)}</button>)}
        </div>
      )}
      {step === 2 && (
        <div className="tiles">
          {items.map((c) => <button type="button" key={c} className="tile" onClick={() => set({ category: c, unit: CATEGORY_UNIT[c] || 'item' })}><span className="tile-ico">{CATEGORY_ICON[c] || custom.find((x) => x.key === c)?.icon || '•'}</span>{catLabel(c)}</button>)}
        </div>
      )}
      {step === 3 && (
        <>
          <div className="grid2">
            <MoneyInput big autoFocus label={t('amount')} cents={f.amountC} onCents={(c) => set({ amountC: c })} keypad error={issuesFor(issues, 'amount', t, f.amountC)} />
            <DateInput label={t('date')} value={f.day} onChange={(v) => set({ day: v })} />
          </div>
          <Seg label={t('exp.source')} value={f.source} onChange={(v) => set({ source: v })} options={opts(['cash', 'person'], t, 'exp.src.')} />
          {f.source === 'person' && <Select label={t('exp.person')} value={f.personId} onChange={(v) => set({ personId: v })} options={parties.people} placeholder={t('select')} error={issuesFor(issues, 'personId', t, f.amountC)} />}
          {f.source !== 'person' && (
            <>
              <Seg value={f.payMode} onChange={(v) => set({ payMode: v })} options={[{ value: 'all', label: t('exp.payAll') }, { value: 'part', label: t('exp.payPart') }, { value: 'none', label: t('exp.payNone') }]} />
              {f.payMode === 'part' && <MoneyInput label={t('exp.paid')} cents={f.paidC} onCents={(c) => set({ paidC: c })} hint={t('exp.remain', { a: fmt(Math.max(0, f.amountC - f.paidC)) })} error={issuesFor(issues, 'paid', t)} />}
              {f.payMode !== 'all' && <DateInput label={t('exp.due')} value={f.dueDay} onChange={(v) => set({ dueDay: v })} />}
            </>
          )}
          <div className="grid2">
            <Picker label={t('exp.supplier')} value={f.supplierId} onChange={(v) => set({ supplierId: v })} options={parties.suppliers} allowEmpty={t('exp.noSupplier')} placeholder={t('exp.noSupplier')} />
            <TextInput label={t('exp.vendor')} value={f.vendor} onChange={(v) => set({ vendor: v })} />
          </div>
          <div className="grid2">
            <QtyInput label={`${t('qty')} (${t('optional')})`} value={f.qty} onValue={(v) => set({ qty: v })} />
            <Select label={t('unit')} value={f.unit || CATEGORY_UNIT[f.category] || 'item'} onChange={(v) => set({ unit: v })} options={opts(['kg', 'bag', 'L', 'head', 'dose', 'item'], t, 'u.')} />
          </div>
          {f.source !== 'person' && snap.capitalC > 0 && <Check label={t('exp.capital')} checked={f.capital} onChange={(v) => set({ capital: v })} hint={`${t('cash.capital')}: ${fmt(snap.capitalC)}`} />}
          <Field label={t('exp.receipt')}>
            <div className="receipt-row">
              {f.receipt && <img src={f.receipt} alt="" className="thumb" />}
              <label className="btn btn-quiet btn-sm"><Icon name="upload" size={16} /><span>{t('exp.addReceipt')}</span>
                <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) set({ receipt: await readImage(file, 900, 0.7) }); }} />
              </label>
              {f.receipt && <Button size="sm" onClick={() => set({ receipt: '' })}>{t('delete')}</Button>}
            </div>
          </Field>
          <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
        </>
      )}
    </Sheet>
  );
}

/* ───────────── Supplier payment ───────────── */
export function SupplierPaySheet({ record, supplierId, billId, personId, onClose }) {
  const { farm, t, fmt, today, snap } = useApp();
  const parties = useParties();
  const init = record ? { day: record.day, supplierId: record.supplierId, billId: record.billId || '', amountC: record.amountC, source: record.source || 'cash', personId: record.personId || '', note: record.note || '' }
    : { day: today, supplierId: supplierId || '', billId: billId || '', amountC: 0, source: personId ? 'person' : 'cash', personId: personId || '', note: '' };
  const [f, setF, clearDraft] = useDraft(`sp:${supplierId || ''}`, init, !record);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const open = f.supplierId ? supplierBills(farm, f.supplierId, { today }).bills.filter((b) => b.dueC > 0) : [];
  const dueC = (snap.sup[f.supplierId]?.dueC || 0) + (record && record.supplierId === f.supplierId ? record.amountC : 0);
  const rec = { type: 'supplierPay', day: f.day, supplierId: f.supplierId, billId: f.billId || null, amountC: f.amountC, source: f.source, personId: f.source === 'person' ? f.personId : null, note: f.note };
  const issues = validateRecord(rec, { today, dueC });
  const bill = open.find((b) => b.id === f.billId);
  return (
    <Sheet title={record ? t('sp.edit') : t('sp.title')} onClose={onClose}
      footer={<TxFooter recs={[rec]} editing={record} ctx={{ dueC }} onDone={(m) => { clearDraft(); if (m === 'close' || record) onClose(); }} />}>
      <div className="grid2">
        <Picker label={t('exp.supplier')} value={f.supplierId} onChange={(v) => set({ supplierId: v, billId: '' })} options={parties.suppliers} error={issuesFor(issues, 'supplierId', t, f.amountC)} />
        <DateInput label={t('date')} value={f.day} onChange={(v) => set({ day: v })} />
      </div>
      {f.supplierId && <div className="due-line">{t('sup.we_owe')}: <b className="num">{fmt(dueC)}</b></div>}
      {open.length > 0 && <Picker label={t('sup.billOpt')} value={f.billId} onChange={(v) => set({ billId: v })} allowEmpty={t('sup.anyBill')} placeholder={t('sup.anyBill')}
        options={open.map((b) => ({ value: b.id, label: `${b.opening ? t('c.opening') : t(`c.${b.category}`)} · ${b.day.startsWith('0000') ? '' : b.day}`, sub: fmt(b.dueC) }))} />}
      <MoneyInput big autoFocus label={t('amount')} cents={f.amountC} onCents={(c) => set({ amountC: c })} keypad
        chips={[bill && { label: t('exp.payBill'), cents: bill.dueC }, dueC > 0 && { label: t('sale.payFull'), cents: dueC }].filter(Boolean)} error={issuesFor(issues, 'amount', t, f.amountC)} />
      <Seg label={t('exp.source')} value={f.source} onChange={(v) => set({ source: v })} options={opts(['cash', 'person'], t, 'exp.src.')} />
      {f.source === 'person' && <Select label={t('exp.person')} value={f.personId} onChange={(v) => set({ personId: v })} options={parties.people} placeholder={t('select')} error={issuesFor(issues, 'personId', t, f.amountC)} />}
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

/* ───────────── Manager / funder movement ───────────── */
export function PersonSheet({ record, personId, purpose: presetPurpose, onClose }) {
  const { t, today, ui } = useApp();
  const parties = useParties();
  const recPurpose = record ? (record.kind === 'inject' ? 'inject' : record.purpose === 'personal' ? 'personal' : 'cashOut') : null;
  const [f, setF] = useState(record ? { day: record.day, personId: record.personId, purpose: recPurpose, amountC: record.amountC, account: record.account || 'cash', note: record.note || '' }
    : { day: today, personId: personId || '', purpose: presetPurpose || 'inject', amountC: 0, account: 'cash', note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  // Purposes that post into other departments open that department's sheet.
  const redirect = (p) => {
    if (p === 'outOfPocket') { onClose(); ui.open('expense', { personId: f.personId }); return true; }
    if (p === 'supplier') { onClose(); ui.open('supplierPay', { personId: f.personId }); return true; }
    if (p === 'retained') { onClose(); ui.open('payment', { keptBy: f.personId }); return true; }
    return false;
  };
  const rec = { type: 'capital', day: f.day, personId: f.personId, kind: f.purpose === 'inject' ? 'inject' : 'withdraw', purpose: f.purpose === 'inject' ? 'capital' : f.purpose === 'personal' ? 'personal' : 'return', amountC: f.amountC, account: f.account, note: f.note };
  const issues = validateRecord(rec, { today });
  const list = record ? ['inject', 'cashOut', 'personal'] : PERSON_PURPOSES;
  return (
    <Sheet title={t('cap.title')} onClose={onClose}
      footer={<TxFooter recs={[rec]} editing={record} onDone={(m) => { if (m === 'close' || record) onClose(); else set({ amountC: 0, note: '' }); }} />}>
      <Select label={t('cap.person')} value={f.personId} onChange={(v) => set({ personId: v })} options={parties.people} placeholder={t('select')} error={issuesFor(issues, 'personId', t, f.amountC)} />
      <div className="purpose-list" role="radiogroup" aria-label={t('ppl.what')}>
        {list.map((p) => (
          <button type="button" role="radio" aria-checked={f.purpose === p} key={p} className={`purpose ${f.purpose === p ? 'on' : ''}`} disabled={!f.personId && ['outOfPocket', 'supplier', 'retained'].includes(p)}
            onClick={() => { if (!redirect(p)) set({ purpose: p }); }}>
            <b>{t(`pp.${p}`)}</b><span>{t(`ppd.${p}`)}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <MoneyInput big label={t('amount')} cents={f.amountC} onCents={(c) => set({ amountC: c })} keypad error={issuesFor(issues, 'amount', t, f.amountC)} />
        <DateInput label={t('date')} value={f.day} onChange={(v) => set({ day: v })} />
      </div>
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

/* ───────────── Milk ───────────── */
export function MilkSheet({ record, onClose }) {
  const { farm, t, today, actor, snap } = useApp();
  const parties = useParties();
  const mode = record ? (record.animalId ? 'animal' : 'herd') : farm.settings.milkMode;
  const [m, setM] = useState(mode);
  const milking = Object.keys(SPECIES).filter((s) => SPECIES[s].product === 'milk');
  const herdSpecies = milking.filter((s) => farm.animals.some((a) => a.species === s)) ;
  const [f, setF] = useState(record ? { day: record.day, species: record.species || 'cow', am: record.session === 'am' ? record.liters : 0, pm: record.session === 'pm' ? record.liters : 0, liters: record.liters, session: record.session, animalId: record.animalId || '', unit: 'L' }
    : { day: today, species: herdSpecies[0] || 'cow', am: 0, pm: 0, liters: 0, session: new Date().getHours() < 12 ? 'am' : 'pm', animalId: '', unit: farm.settings.milkUnit === 'kg' ? 'kg' : 'L' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const L = (q) => Math.round(litresOf(q, f.unit) * 1000) / 1000;
  let recs;
  if (record) recs = [{ type: 'milk', day: f.day, species: f.species, session: f.session, liters: L(f.liters), animalId: record.animalId || null }];
  else if (m === 'herd') recs = [f.am > 0 && { type: 'milk', day: f.day, species: f.species, session: 'am', liters: L(f.am) }, f.pm > 0 && { type: 'milk', day: f.day, species: f.species, session: 'pm', liters: L(f.pm) }].filter(Boolean);
  else recs = [{ type: 'milk', day: f.day, species: farm.animals.find((a) => a.id === f.animalId)?.species || 'cow', session: f.session, liters: L(f.liters), animalId: f.animalId || null }];
  const existing = !record && m === 'herd' ? farm.records.filter((r) => r.type === 'milk' && !r.deletedAt && !r.animalId && r.day === f.day && r.species === f.species && recs.some((x) => x.session === r.session)) : [];
  const extraOp = existing.length ? (x) => deleteRecords(x, existing.map((r) => r.id), actor, 'replaced') : null;
  const herdAnimals = parties.animals.filter((a) => SPECIES[a.species]?.product === 'milk');
  return (
    <Sheet title={record ? `${t('edit')} · ${t('t.milk')}` : t('new.milk')} onClose={onClose}
      footer={recs.length ? <TxFooter recs={recs} editing={record} extraOp={extraOp} saveAndNew={m === 'animal'} onDone={(x) => { if (x === 'close' || record) onClose(); else set({ liters: 0 }); }} /> : null}>
      {!record && <Seg value={m} onChange={setM} options={[{ value: 'herd', label: t('prod.herdMode') }, { value: 'animal', label: t('prod.animalMode') }]} />}
      <div className="grid2">
        <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
        <Seg small label={t('unit')} value={f.unit} onChange={(v) => set({ unit: v })} options={[{ value: 'L', label: t('u.L') }, { value: 'kg', label: t('u.kg') }]} />
      </div>
      {f.unit === 'kg' && <div className="muted small">{t('prod.unitHint')}</div>}
      {(m === 'herd' && !record) ? (
        <>
          {milking.length > 1 && <Seg value={f.species} onChange={(v) => set({ species: v })} options={milking.map((s) => ({ value: s, label: t(`sp.${s}`) }))} />}
          <div className="grid2">
            <QtyInput autoFocus label={t('prod.am')} value={f.am} onValue={(v) => set({ am: v })} unit={t(`u.${f.unit}`)} />
            <QtyInput label={t('prod.pm')} value={f.pm} onValue={(v) => set({ pm: v })} unit={t(`u.${f.unit}`)} />
          </div>
          <div className="totals"><div className="grand"><span>{t('prod.dayTotal')}</span><span className="num">{milkQ(L(f.am) + L(f.pm))}</span></div></div>
          {existing.length > 0 && <div className="note warn">{t('prod.existsDay')}</div>}
        </>
      ) : (
        <>
          {!record && <Picker label={t('ani.title')} value={f.animalId} onChange={(v) => set({ animalId: v })} options={herdAnimals} />}
          <Seg value={f.session} onChange={(v) => set({ session: v })} options={[{ value: 'am', label: t('prod.am') }, { value: 'pm', label: t('prod.pm') }, ...(record?.session === 'day' ? [{ value: 'day', label: t('prod.day') }] : [])]} />
          <QtyInput autoFocus label={t('qty')} value={f.liters} onValue={(v) => set({ liters: v })} unit={t(`u.${f.unit}`)} />
        </>
      )}
      <div className="muted small">{t('prod.tank')}: <b className="num">{milkQ(snap.milk.stockL)}</b></div>
    </Sheet>
  );
}

export function MilkUseSheet({ record, onClose }) {
  const { farm, t, today, snap } = useApp();
  const reasons = [...MILK_USE_REASONS, ...(farm.settings.milkUseReasons || [])];
  const [f, setF] = useState(record ? { day: record.day, liters: record.liters, reason: record.reason, note: record.note || '' } : { day: today, liters: 0, reason: 'calves', note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const rec = { type: 'milkUse', day: f.day, liters: f.liters, reason: f.reason, note: f.note };
  return (
    <Sheet title={t('prod.use')} onClose={onClose} footer={<TxFooter recs={[rec]} editing={record} saveAndNew={false} onDone={onClose} />}>
      <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
      <QtyInput autoFocus label={t('qty')} value={f.liters} onValue={(v) => set({ liters: v })} unit={t('u.L')} hint={t('sale.inStock', { l: `${milkQ(snap.milk.stockL + (record?.liters || 0))}` })} />
      <Seg wrap value={f.reason} onChange={(v) => set({ reason: v })} options={reasons.map((r) => ({ value: r, label: t(`use.${r}`) !== `use.${r}` ? t(`use.${r}`) : r }))} />
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function EggsSheet({ record, onClose }) {
  const { farm, t, today } = useApp();
  const flocks = farm.animals.filter((a) => a.species === 'chicken' && a.status !== 'sold');
  const [f, setF] = useState(record ? { day: record.day, flockId: record.flockId, count: record.count, broken: record.broken || 0 } : { day: today, flockId: flocks[0]?.id || '', count: 0, broken: 0 });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const rec = { type: 'eggs', day: f.day, flockId: f.flockId, count: f.count, broken: f.broken };
  const issues = validateRecord(rec, { today });
  if (!flocks.length && !record) return <Sheet title={t('new.eggs')} onClose={onClose}><p>{t('prod.noFlock')}</p></Sheet>;
  return (
    <Sheet title={t('new.eggs')} onClose={onClose} footer={<TxFooter recs={[rec]} editing={record} onDone={(m) => (m === 'close' || record ? onClose() : set({ count: 0, broken: 0 }))} />}>
      <div className="grid2">
        <Select label={t('prod.flock')} value={f.flockId} onChange={(v) => set({ flockId: v })} options={flocks.map((a) => ({ value: a.id, label: a.tag }))} />
        <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
      </div>
      <div className="grid2">
        <QtyInput autoFocus label={t('prod.collected')} value={f.count} onValue={(v) => set({ count: Math.round(v) })} unit={t('u.egg')} />
        <QtyInput label={t('prod.broken')} value={f.broken} onValue={(v) => set({ broken: Math.round(v) })} error={issuesFor(issues, 'broken', t)} />
      </div>
    </Sheet>
  );
}

export function MedicineSheet({ record, animalId, onClose }) {
  const { t, today } = useApp();
  const parties = useParties();
  const [f, setF] = useState(record ? { day: record.day, animalId: record.animalId, kind: record.kind, name: record.name || '', costC: record.costC || 0, note: record.note || '' } : { day: today, animalId: animalId || '', kind: 'vitamins', name: '', costC: 0, note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const rec = { type: 'medicine', day: f.day, animalId: f.animalId, kind: f.kind, name: f.name, costC: f.costC, note: f.note };
  const issues = validateRecord(rec, { today });
  return (
    <Sheet title={t('med.title')} onClose={onClose} footer={<TxFooter recs={[rec]} editing={record} onDone={(m) => (m === 'close' || record ? onClose() : set({ animalId: '' }))} />}>
      <div className="grid2">
        <Picker label={t('ani.title')} value={f.animalId} onChange={(v) => set({ animalId: v })} options={parties.animals} error={issuesFor(issues, 'animalId', t, f.costC || f.name)} />
        <DateInput label={t('date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
      </div>
      <Seg wrap value={f.kind} onChange={(v) => set({ kind: v })} options={opts(MEDICINE_KINDS, t, 'mk.')} />
      <TextInput label={t('med.name')} value={f.name} onChange={(v) => set({ name: v })} list="med-suggest" />
      <datalist id="med-suggest">{MEDICINE_SUGGEST.map((m) => <option key={m} value={m} />)}</datalist>
      <MoneyInput label={`${t('med.cost')} (${t('optional')})`} hint={t('med.costHint')} cents={f.costC} onCents={(c) => set({ costC: c })} />
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
    </Sheet>
  );
}

export function NewMenu({ onClose }) {
  const { t, ui, actor } = useApp();
  const items = [
    ['sale', 'cart'], ['payment', 'cash'], ['expense', 'receipt'], ['milk', 'milk'], ['eggs', 'egg'],
    ['supplierPay', 'truck'], ['person', 'people'], ['milkUse', 'milk'], ['medicine', 'cow'],
  ];
  return (
    <Sheet title={t('new.title')} onClose={onClose}>
      <div className="new-grid">
        {items.map(([k, ic]) => (
          <button type="button" key={k} className="new-item" onClick={() => { onClose(); ui.open(k === 'person' ? 'capital' : k, {}); }}>
            <Icon name={ic} size={22} /><span>{t(`new.${k}`)}</span>
          </button>
        ))}
      </div>
      <div className="muted small kbd-hint">{t('kbd.hint')}</div>
    </Sheet>
  );
}
