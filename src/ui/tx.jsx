import React, { useEffect, useMemo, useState } from 'react';
import { milkUseLabel, milkQ } from './units.js';
import { play as playSound } from './sound.js';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Sheet, TextInput, Seg, dayLabel } from './kit.jsx';
import { addRecord, editRecord, deleteRecords, restoreRecords, purgeRecords, voidSale, unvoidSale, preview, changedFields, isMoney, MONEY_FIELDS } from '../core/commands.mjs';
import { validateRecord, findDuplicate } from '../core/validate.mjs';
import { offsetsC } from '../core/ledger.mjs';
import { fmtQty } from '../core/money.mjs';
import { can } from '../core/catalog.mjs';
import { docNo } from '../core/accounts.mjs';
import { removeRecords, produceOf, deleteMaster, setArchived, linkedRecords, herdRecords } from '../core/removal.mjs';

/** One-line description of any record, for lists and drawers. */
export function describe(r, { t, names, fmt }) {
  switch (r.type) {
    case 'sale': {
      const items = r.lines.map((l) => `${t(`pr.${l.product}`)} ${fmtQty(l.qty)} ${t(`u.${l.unit}`)}`).join('، ');
      return { title: r.customerId ? names.customer(r.customerId) : t('sale.walkin'), sub: items, amountC: r.totalC, icon: 'cart', kind: t('t.sale') };
    }
    case 'payment':
      return { title: names.customer(r.customerId), sub: [r.keptBy && `${t('pay.keptBy')} ${names.person(r.keptBy)}`, r.offsets?.length && `${t('pay.offsets')}: ${fmt(offsetsC(r))}`].filter(Boolean).join(' · ') || t(`m.${r.method || 'cash'}`), amountC: (r.cashC || 0) + offsetsC(r), icon: 'cash', kind: t('t.payment') };
    case 'expense':
      return { title: t(`c.${r.category}`) !== `c.${r.category}` ? t(`c.${r.category}`) : r.category, sub: [r.supplierId && names.supplier(r.supplierId), r.vendor, r.source === 'person' && t('exp.fromPerson', { n: names.person(r.personId) }), r.note].filter(Boolean).join(' · '), amountC: r.amountC, icon: 'receipt', kind: t('t.expense') };
    case 'supplierPay':
      return { title: names.supplier(r.supplierId), sub: r.source === 'person' ? t('exp.fromPerson', { n: names.person(r.personId) }) : t(`acc.${r.source === 'bank' ? 'bank' : 'cash'}`), amountC: r.amountC, icon: 'truck', kind: t('t.supplierPay') };
    case 'opening':
      return { title: t('dz.openingRec'), sub: r.note || '', amountC: r.cashC || 0, icon: 'history', kind: t('dz.openingRec') };
    case 'capital':
      return { title: names.person(r.personId), sub: t(r.kind === 'inject' ? 'pp.inject' : r.purpose === 'personal' ? 'pp.personal' : 'pp.cashOut'), amountC: r.amountC, icon: 'people', kind: t('t.capital') };
    case 'milk':
      return { title: `${t('pr.milk')} · ${t(`prod.${r.session}`)}`, sub: (r.animalId ? names.animal(r.animalId) : t('prod.herdMode')) + (!r.animalId && r.species && r.species !== 'cow' ? ` · ${t(`sp.${r.species}`)}` : ''), qty: `${milkQ(r.liters)}`, icon: 'milk', kind: t('t.milk') };
    case 'milkUse':
      return { title: t('t.milkUse'), sub: milkUseLabel(r.reason, t), qty: `${milkQ(r.liters)}`, icon: 'milk', kind: t('t.milkUse') };
    case 'eggUse':
      return { title: t('t.eggUse'), sub: r.note || t(`use.${r.reason || 'waste'}`), qty: `−${r.count}`, icon: 'egg', kind: t('t.eggUse') };
    case 'eggs':
      return { title: t('pr.eggs'), sub: names.animal(r.flockId), qty: `${r.count}${r.broken ? ` (−${r.broken})` : ''}`, icon: 'egg', kind: t('t.eggs') };
    case 'medicine':
      return { title: `${t(`mk.${r.kind}`)}${r.name ? ` · ${r.name}` : ''}`, sub: names.animal(r.animalId), amountC: r.costC || null, icon: 'cow', kind: t('t.medicine') };
    case 'transfer':
      return { title: t(r.fromAccount === 'bank' ? 'tr.bankToBox' : 'tr.boxToBank'), amountC: r.amountC, icon: 'swap', kind: t('t.transfer') };
    case 'animalEvent':
      return { title: t(`ae.${r.kind}`) !== `ae.${r.kind}` ? t(`ae.${r.kind}`) : r.kind, sub: names.animal(r.animalId), icon: 'cow', kind: t('t.animalEvent') };
    default:
      return { title: r.type, icon: 'file', kind: r.type };
  }
}

export function ImpactList({ impact, compact }) {
  const { t, fmt } = useApp();
  if (!impact) return null;
  if (!impact.length) return <div className="impact-none">{t('imp.none')}</div>;
  const show = (i, v) => (i.kind === 'qty' ? `${milkQ(v)}` : i.kind === 'count' ? fmtQty(v, 0) : fmt(v));
  return (
    <ul className={`impact ${compact ? 'compact' : ''}`}>
      {impact.map((i) => {
        if (i.kind === 'status') return (
          <li key={i.key + (i.ref?.id || '')}>
            <span className="impact-label">{t('imp.animal', { n: i.ref?.name || '' })}</span>
            <span className="impact-vals"><span className="was">{t(`as.${i.before}`)}</span><Icon name="chev" size={14} className="flip-rtl" /><b>{t(`as.${i.after}`)}</b></span>
          </li>
        );
        const delta = i.after - i.before;
        return (
          <li key={i.key + (i.ref?.id || '')}>
            <span className="impact-label">{t(`imp.${i.key}`, { n: i.ref?.name || '' })}</span>
            <span className="impact-vals num">
              <span className="was">{show(i, i.before)}</span>
              <Icon name="chev" size={14} className="flip-rtl" />
              <b>{show(i, i.after)}</b>
              <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? '+' : '−'}{show(i, Math.abs(delta)).replace('−', '')}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function issueText(i, t) {
  if (i.code === 'milk.oversell') return t('e.milk.oversell', { l: `${milkQ(i.shortL)}` });
  if (i.code === 'locked') return t('e.locked', { d: i.detail?.lock });
  return t(`e.${i.code}`);
}
export const issuesFor = (issues, field, t, value) => {
  if (value !== undefined && !value) return null;
  const i = issues.find((x) => x.field === field || x.field?.startsWith(field + '.'));
  return i ? issueText(i, t) : null;
};

/**
 * The bottom of every transaction sheet: validation, live impact preview,
 * reason for money edits, duplicate check, and the save buttons.
 */
export function TxFooter({ recs, editing, ctx = {}, extraOp, onDone, saveAndNew = true, label, showIssues, onSaved }) {
  const { farm, actor, t, today, names, commit } = useApp();
  const [reason, setReason] = useState('');
  const [dupOk, setDupOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const vctx = { today, tax: farm.settings.tax, ...ctx };
  const issues = recs.flatMap((r) => validateRecord(r, vctx));
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const fields = editing ? changedFields(editing, { ...editing, ...recs[0] }) : [];
  const needsReason = !!editing && isMoney(editing) && fields.some((f) => MONEY_FIELDS.includes(f));
  const dup = !editing && recs.length === 1 && findDuplicate(farm, recs[0]);
  const locked = farm.settings.lockedThrough && recs.some((r) => r.day && r.day <= farm.settings.lockedThrough);

  const op = useMemo(() => (f) => {
    let next = editing
      ? editRecord(f, editing.id, recs[0], actor, reason || (needsReason ? '' : 'edit'))
      : recs.reduce((x, r) => addRecord(x, r, actor), f);
    if (extraOp) next = extraOp(next);
    return next;
  }, [JSON.stringify(recs), editing?.id, reason, actor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The impact preview follows typing a moment later, so keys never wait for it.
  const recKey = JSON.stringify(recs) + reason;
  const [settled, setSettled] = useState(recKey);
  useEffect(() => { if (settled === recKey) return undefined; const id = setTimeout(() => setSettled(recKey), 220); return () => clearTimeout(id); }, [recKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pvOp = needsReason && reason.trim().length < 3 ? (f) => (editing ? editRecord(f, editing.id, recs[0], actor, 'preview') : f) : op;
  const pv = useMemo(() => (errors.length ? null : preview(farm, pvOp, { names, today })),
    [farm, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  const blockers = [...errors, ...(pv?.issues.filter((i) => i.severity === 'error') || [])];
  const reasonMissing = needsReason && reason.trim().length < 3;
  const disabled = busy || blockers.length > 0 || reasonMissing || (dup && !dupOk) || (editing && !fields.length);

  const save = (again) => {
    // Saving straight after typing: check the latest figures before committing.
    if (settled !== recKey) {
      const fresh = preview(farm, op, { names, today });
      if (fresh.issues.some((i) => i.severity === 'error')) { setSettled(recKey); playSound('fail'); return; }
    }
    setBusy(true);
    const next = commit(op, { label: label || (editing ? t('ed.edited') : t('saved')) });
    setBusy(false);
    if (next) {
      onSaved?.(next);
      onDone?.(again ? 'again' : 'close');
      setReason('');
      setDupOk(false);
    }
  };

  const globalErrors = blockers.filter((i) => showIssues || !i.field);
  return (
    <div className="tx-foot">
      {locked && <div className="note warn"><Icon name="lock" size={16} />{t('ed.lockedNote')}</div>}
      {pv && (
        <details className="impact-box" open>
          <summary>{t('imp.title')}</summary>
          <ImpactList impact={pv.impact} compact />
        </details>
      )}
      {globalErrors.map((i, n) => <div key={n} className="note bad"><Icon name="alert" size={16} />{issueText(i, t)}</div>)}
      {warns.map((i, n) => <div key={`w${n}`} className="note warn"><Icon name="alert" size={16} />{issueText(i, t)}</div>)}
      {needsReason && <TextInput label={t('ed.reason')} hint={t('ed.reasonHint')} value={reason} onChange={setReason} id="edit-reason" />}
      {dup && (
        <label className="note warn dup">
          <input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} />
          {t('ed.dup')}
        </label>
      )}
      <div className="foot-btns">
        {!editing && saveAndNew && <Button onClick={() => save(true)} disabled={disabled}>{t('saveNew')}</Button>}
        <Button variant="primary" onClick={() => save(false)} disabled={disabled}>{busy ? t('saving') : t('save')}</Button>
      </div>
    </div>
  );
}

/** Full story of a record: what it did, what it is linked to, who changed it. */
export function RecordDrawer({ id, onClose }) {
  const app = useApp();
  const { farm, t, fmt, names, ui, lang, actor, commit, today, nav } = app;
  const r = farm.records.find((x) => x.id === id);
  const effects = useMemo(() => (r && !r.deletedAt ? preview(farm, (f) => deleteRecords(f, [r.id], null, ''), { names, today }).impact.map((i) => ({ ...i, before: i.after, after: i.before })) : []), [farm, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Sheet title={t('e.notFound')} onClose={onClose} />;
  const d = describe(r, app);
  const money = isMoney(r);
  const canEdit = !money || can(actor?.role, 'money.edit');
  const canDel = !money || can(actor?.role, 'money.delete');
  const status = r.deletedAt ? 'deleted' : r.voided ? 'voided' : r.editedAfterClose ? 'afterClose' : r.history?.length ? 'edited' : null;
  const fieldList = detailFields(r, app);
  return (
    <Sheet title={r.no ? `${d.kind} · ${docNo(r, farm.settings)}` : d.kind} sub={`${dayLabel(r.day, lang, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}`} onClose={onClose}
      footer={r.deletedAt ? (
        <div className="foot-btns">
          {can(actor?.role, 'purge') && <Button variant="danger" onClick={() => ui.open('purge', { ids: [r.id] })}>{t('ed.purge')}</Button>}
          <Button variant="primary" icon="undo" onClick={() => { commit((f) => restoreRecords(f, [r.id], actor), { label: t('restored') }); }}>{t('restore')}</Button>
        </div>
      ) : (
        <div className="foot-btns">
          {canDel && <Button variant="danger" icon="trash" onClick={() => ui.open('delete', { ids: [r.id], onDone: onClose })}>{t('delete')}</Button>}
          {r.type === 'sale' && canDel && (r.voided
            ? <Button icon="undo" onClick={() => commit((f) => unvoidSale(f, r.id, actor), { label: t('sale.unvoid') })}>{t('sale.unvoid')}</Button>
            : <Button onClick={() => ui.open('void', { id: r.id })}>{t('sale.void')}</Button>)}
          {r.type === 'sale' && <Button icon="print" onClick={() => ui.open('doc', { kind: r.customerId ? 'invoice' : 'receipt', id: r.id })}>{r.customerId ? t('sale.invoice') : t('sale.receipt')}</Button>}
          {r.type === 'payment' && <Button icon="print" onClick={() => ui.open('doc', { kind: 'paymentReceipt', id: r.id })}>{t('sale.receipt')}</Button>}
          {canEdit && !r.voided && <Button variant="primary" icon="edit" onClick={() => { onClose(); ui.open(r.type, { record: r }); }}>{t('edit')}</Button>}
        </div>
      )}>
      <div className="drawer-hero">
        <div className="drawer-title">{d.title}</div>
        {d.amountC != null && <div className="drawer-amount num">{fmt(d.amountC)}</div>}
        {d.qty && <div className="drawer-amount num">{d.qty}</div>}
        {status && <Pill status={status}>{t(`st.${status}`)}</Pill>}
        {r.voided && <div className="muted small">{t(r.voided.mode === 'restore' ? 'sale.voidRestore' : 'sale.voidWriteoff')} · {r.voided.reason}</div>}
        {r.deletedAt && <div className="muted small">{t('trash.deletedBy', { n: r.deletedByName })} · {r.deleteReason}</div>}
      </div>
      {(() => {
        const pid = r.personId || r.keptBy || r.takenBy;
        const aid = r.animalId || r.flockId;
        const links = [
          r.customerId && ['sales', r.customerId, names.customer(r.customerId), 'user'],
          r.supplierId && ['suppliers', r.supplierId, names.supplier(r.supplierId), 'truck'],
          pid && ['people', pid, names.person(pid), 'people'],
          aid && ['animals', aid, names.animal(aid), 'cow'],
        ].filter(Boolean);
        if (!links.length) return null;
        return (
          <div className="link-chips">
            <span className="muted small">{t('drawer.related')}</span>
            {links.map(([n, id, label, ic]) => (
              <button type="button" key={n + id} className="link-chip" title={t('ws.popHint')} onClick={() => { onClose(); nav(n, id); }}>
                <Icon name={ic} size={14} /><span>{label}</span><Icon name="chev" size={13} className="flip-rtl" />
              </button>
            ))}
          </div>
        );
      })()}
      <dl className="kv">
        {fieldList.map(([k, v]) => v != null && v !== '' && (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
        <dt>{t('by')}</dt><dd>{r.createdByName}</dd>
        <dt>{t('when')}</dt><dd className="num">{new Date(r.createdAt).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB')}</dd>
      </dl>
      {r.receipt && <img className="receipt-img" src={r.receipt} alt={t('exp.receipt')} />}
      {effects.length > 0 && (
        <section className="drawer-sec">
          <h3>{t('imp.did')}</h3>
          <ImpactList impact={effects} compact />
        </section>
      )}
      {r.history?.length > 0 && (
        <section className="drawer-sec">
          <h3><Icon name="history" size={16} /> {t('history')}</h3>
          <ol className="history">
            {[...r.history].reverse().map((h, i) => (
              <li key={i}>
                <div className="h-head"><b>{h.byName}</b> <span className="muted num">{new Date(h.at).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB')}</span>{h.afterClose && <Pill status="afterClose">{t('st.afterClose')}</Pill>}</div>
                {h.reason && h.reason !== 'edit' && <div className="h-reason">“{h.reason}”</div>}
                {h.fields?.filter((f) => !['history'].includes(f)).map((f) => (
                  <div key={f} className="h-change"><span className="muted">{fieldName(f, t)}</span> <span className="was">{fmtVal(h.before?.[f], f, app)}</span></div>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </Sheet>
  );
}

function fieldName(f, t) {
  const map = { amountC: 'amount', paidC: 'exp.paid', cashC: 'pay.cash', totalC: 'total', paidNowC: 'sale.payNow', lines: 'items', liters: 'qty', count: 'qty', day: 'date', customerId: 'sale.customer', supplierId: 'exp.supplier', personId: 'cap.person', category: 'exp.item', note: 'note', offsets: 'pay.offsets', source: 'exp.source', voided: 'status', costC: 'med.cost', session: 'prod.day' };
  return map[f] ? t(map[f]) : f;
}
function fmtVal(v, f, { fmt, t, names }) {
  if (v == null || v === '') return '—';
  if (f.endsWith('C') && typeof v === 'number') return fmt(v);
  if (f === 'customerId') return names.customer(v);
  if (f === 'supplierId') return names.supplier(v);
  if (f === 'personId' || f === 'keptBy') return names.person(v);
  if (f === 'lines') return v.map((l) => `${t(`pr.${l.product}`)} ${fmtQty(l.qty)}×${fmt(l.priceC)}`).join('، ');
  if (f === 'offsets') return v.map((o) => `${t(`c.${o.category}`)} ${fmt(o.amountC)}`).join('، ') || '—';
  if (f === 'voided') return v ? t('st.voided') : '—';
  if (f === 'category') return t(`c.${v}`);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function detailFields(r, { t, fmt, names }) {
  const out = [];
  if (r.type === 'sale') {
    r.lines.forEach((l, i) => out.push([`${t(`pr.${l.product}`)}${r.lines.length > 1 ? ` ${i + 1}` : ''}`, `${fmtQty(l.qty)} ${t(`u.${l.unit}`)} × ${fmt(l.priceC)} = ${fmt(l.amountC)}`]));
    if (r.discountC) out.push([t('sale.discount'), `${fmt(r.discountC)}${r.discount?.reason ? ` · ${r.discount.reason}` : ''}`]);
    if (r.taxC) out.push([t('sale.tax'), fmt(r.taxC)]);
    out.push([t('total'), fmt(r.totalC)]);
    out.push([t('sale.payNow'), fmt(r.paidNowC || 0)]);
    if (r.tenderC) out.push([t('sale.received'), fmt(r.tenderC)]);
    if (r.tenderC > r.totalC) out.push([t('sale.change'), fmt(r.tenderC - r.totalC)]);
    if (r.customerId && r.totalC > (r.paidNowC || 0)) out.push([t('sale.remains'), fmt(r.totalC - (r.paidNowC || 0))]);
  } else if (r.type === 'payment') {
    out.push([t('pay.cash'), fmt(r.cashC || 0)]);
    (r.offsets || []).forEach((o) => out.push([t(`c.${o.category}`), `${fmt(o.amountC)} · ${o.desc}`]));
    if (r.keptBy) out.push([t('pay.keptBy'), names.person(r.keptBy)]);
  } else if (r.type === 'expense') {
    out.push([t('amount'), fmt(r.amountC)]);
    out.push([t('exp.paid'), fmt(r.paidC || 0)]);
    if (r.amountC > (r.paidC || 0)) out.push([t('exp.remain', { a: '' }).trim(), fmt(r.amountC - (r.paidC || 0))]);
    out.push([t('exp.source'), r.source === 'person' ? names.person(r.personId) : t(`exp.src.${r.source || 'cash'}`)]);
    if (r.supplierId) out.push([t('exp.supplier'), names.supplier(r.supplierId)]);
    if (r.vendor) out.push([t('exp.vendor'), r.vendor]);
    if (r.qty) out.push([t('qty'), `${fmtQty(r.qty)} ${t(`u.${r.unit || 'item'}`)}`]);
    if (r.dueDay) out.push([t('exp.due'), r.dueDay]);
    if (r.capital) out.push([t('exp.capital'), t('yes')]);
  } else if (r.type === 'supplierPay') {
    out.push([t('amount'), fmt(r.amountC)]);
  } else if (r.type === 'milk') {
    out.push([t('prod.species'), t(`sp.${r.species || 'cow'}`)]);
  }
  if (r.note && r.type !== 'expense') out.push([t('note'), r.note]);
  return out;
}

export function DeleteDialog({ ids, onClose, onDone }) {
  const { farm, t, commit, actor, names, today, lang, fmt } = useApp();
  const [reason, setReason] = useState('');
  const recs = farm.records.filter((r) => ids.includes(r.id));
  const produce = produceOf(recs);
  const hasProduce = produce.milkL > 0 || produce.eggs > 0;
  const [stock, setStock] = useState('return');
  const money = recs.some(isMoney);
  const op = (why) => (f) => removeRecords(f, ids, actor, why, { stock, label: t('del.writeOffNote') });
  const pv = useMemo(() => preview(farm, op(reason || 'x'), { names, today }), [farm, ids.join(), actor?.id, stock]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = pv.issues.filter((i) => i.severity === 'error');
  const title = ids.length > 1 ? t('ed.bulk', { n: ids.length }) : t('ed.delTitle', { t: lang === 'en' ? t(`t.${recs[0]?.type}`).toLowerCase() : t(`t.${recs[0]?.type}`) });
  const go = () => {
    const next = commit(op(reason.trim()), { label: t('deleted'), undoable: true });
    if (next) { onClose(); onDone?.(); }
  };
  const what = [produce.milkL > 0 && `${milkQ(produce.milkL)} ${t('pr.milk')}`, produce.eggs > 0 && `${fmtQty(produce.eggs, 0)} ${t('u.egg')}`].filter(Boolean).join(' + ');
  return (
    <Sheet title={title} sub={t('ed.delHint')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" icon="trash" disabled={(money && reason.trim().length < 3) || blocked.length > 0} onClick={go}>{t('delete')}</Button></div>}>
      {hasProduce && (
        <section className="choice-box">
          <h3>{t('del.stockQ', { w: what })}</h3>
          <div className="choice-list" role="radiogroup">
            <button type="button" role="radio" aria-checked={stock === 'return'} className={`choice ${stock === 'return' ? 'on' : ''}`} onClick={() => setStock('return')}>
              <b>{t('del.stockReturn')}</b><span>{t('del.stockReturnHint')}</span>
            </button>
            <button type="button" role="radio" aria-checked={stock === 'keep'} className={`choice ${stock === 'keep' ? 'on' : ''}`} onClick={() => setStock('keep')}>
              <b>{t('del.stockKeep')}</b><span>{t('del.stockKeepHint')}</span>
            </button>
          </div>
        </section>
      )}
      <h3 className="sec-h">{t('imp.alsoChanges')}</h3>
      <ImpactList impact={pv.impact} />
      {blocked.map((i, n) => <div key={n} className="note bad"><Icon name="alert" size={16} />{issueText(i, t)}</div>)}
      {blocked.some((i) => i.code === 'milk.oversell') && <div className="note info">{t('del.oversellHint')}</div>}
      {!pv.ok && pv.issues[0]?.code === 'forbidden' && <div className="note bad">{t('e.forbidden')}</div>}
      <TextInput label={t('ed.delReason')} hint={money ? t('ed.reasonHint') : t('optional')} value={reason} onChange={setReason} id="del-reason" autoFocus />
    </Sheet>
  );
}

/** Delete or archive a customer, supplier, person, animal, worker or obligation. */
export function MasterDeleteDialog({ list, id, onClose, onDone }) {
  const { farm, t, commit, actor, names, today } = useApp();
  const row = (farm[list] || []).find((x) => x.id === id);
  const linked = row ? (list === 'animals' ? herdRecords(farm, id) : linkedRecords(farm, list, id)) : [];
  const moneyCount = row ? linkedRecords(farm, list, id).filter(isMoney).length : 0;
  const party = ['customers', 'suppliers', 'people'].includes(list);
  const soldKept = list === 'animals' && row?.status === 'sold';
  const options = [
    { key: 'archive', ok: !row?.archived },
    { key: 'only', ok: !soldKept && !(party && linked.length) },
    { key: 'withRecords', ok: !soldKept && linked.length > 0 },
  ].filter((o) => o.ok);
  const [mode, setMode] = useState(options[0]?.key || 'only');
  const [reason, setReason] = useState('');
  const op = (f) => (mode === 'archive' ? setArchived(f, list, id, true, actor) : deleteMaster(f, list, id, actor, { mode, reason: reason.trim() }));
  const pv = useMemo(() => preview(farm, op, { names, today }), [farm, mode, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!row) return null;
  const nm = row.name || row.tag || row.party || '—';
  const blocked = pv.issues.filter((i) => i.severity === 'error');
  const go = () => {
    const next = commit(op, { label: mode === 'archive' ? t('archived') : t('deleted'), undoable: true });
    if (next) { onClose(); onDone?.(mode); }
  };
  return (
    <Sheet title={t('del.masterTitle', { n: nm })} sub={linked.length ? t('del.linked', { n: linked.length }) : t('del.noLinked')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant={mode === 'archive' ? 'primary' : 'danger'} icon={mode === 'archive' ? 'archive' : 'trash'} disabled={!options.length || blocked.length > 0 || (mode === 'withRecords' && moneyCount > 0 && reason.trim().length < 3)} onClick={go}>{t(`del.do.${mode}`)}</Button></div>}>
      <div className="choice-list" role="radiogroup">
        {options.map((o) => (
          <button type="button" role="radio" key={o.key} aria-checked={mode === o.key} className={`choice ${mode === o.key ? 'on' : ''}`} onClick={() => setMode(o.key)}>
            <b>{t(`del.m.${o.key}`)}{o.key === 'archive' && linked.length > 0 && <Pill tone="good">{t('del.recommended')}</Pill>}</b>
            <span>{t(`del.mh.${o.key}${list === 'animals' && o.key === 'withRecords' ? 'Animal' : ''}`, { n: linked.length })}</span>
          </button>
        ))}
      </div>
      {party && linked.length > 0 && <div className="note info"><Icon name="alert" size={16} />{t('del.partyHint')}</div>}
      {soldKept && <div className="note info"><Icon name="lock" size={16} />{t('sold.keptHint')}</div>}
      {mode !== 'archive' && options.length > 0 && (
        <>
          <h3 className="sec-h">{t('imp.alsoChanges')}</h3>
          <ImpactList impact={pv.impact} />
          {blocked.map((i, n) => <div key={n} className="note bad"><Icon name="alert" size={16} />{issueText(i, t)}</div>)}
          <TextInput label={t('ed.delReason')} hint={moneyCount && mode === 'withRecords' ? t('ed.reasonHint') : t('optional')} value={reason} onChange={setReason} id="mdel-reason" />
          <p className="muted small">{t('del.restoreHint')}</p>
        </>
      )}
    </Sheet>
  );
}

export function PurgeDialog({ ids, onClose }) {
  const { t, commit, actor } = useApp();
  return (
    <Sheet title={t('ed.purge')} sub={t('ed.purgeHint')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" onClick={() => { if (commit((f) => purgeRecords(f, ids, actor), { label: t('deleted'), undoable: true })) onClose(); }}>{t('ed.purge')}</Button></div>}>
      <p>{t('ed.purgeHint')}</p>
    </Sheet>
  );
}

export function VoidDialog({ id, onClose }) {
  const { farm, t, commit, actor, names, today } = useApp();
  const [mode, setMode] = useState('restore');
  const [reason, setReason] = useState('');
  const pv = useMemo(() => preview(farm, (f) => voidSale(f, id, mode, reason.length >= 3 ? reason : 'preview', actor), { names, today }), [farm, id, mode, actor?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={t('sale.void')} sub={t('sale.voidHint')} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="danger" disabled={reason.trim().length < 3 || !pv.ok} onClick={() => { if (commit((f) => voidSale(f, id, mode, reason, actor), { label: t('voided') })) onClose(); }}>{t('sale.void')}</Button></div>}>
      <Seg value={mode} onChange={setMode} options={[{ value: 'restore', label: t('sale.voidRestore') }, { value: 'writeoff', label: t('sale.voidWriteoff') }]} />
      <h3 className="sec-h">{t('imp.title')}</h3>
      <ImpactList impact={pv.impact} />
      {pv.issues.map((i, n) => <div key={n} className="note bad">{issueText(i, t)}</div>)}
      <TextInput label={t('reason')} hint={t('ed.reasonHint')} value={reason} onChange={setReason} id="void-reason" autoFocus />
    </Sheet>
  );
}

/** A tappable movement row used in every list. */
export function RecordRow({ r, onOpen, selectable, selected, onSelect, right, dir, hideParty, className = '', tag, title }) {
  const app = useApp();
  const d = describe(r, app);
  const status = r.voided ? 'voided' : r.editedAfterClose ? 'afterClose' : null;
  return (
    <div className={`row ${selected ? 'selected' : ''} ${r.voided ? 'is-void' : ''} ${className}`}>
      {selectable && <input type="checkbox" className="row-check" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={app.t('select')} />}
      <button type="button" className="row-main" onClick={() => onOpen(r)} title={title}>
        <span className="row-ico"><Icon name={d.icon} size={18} /></span>
        <span className="row-text">
          <span className="row-title">{hideParty ? (d.sub || d.kind) : d.title}{status && <Pill status={status}>{app.t(`st.${status}`)}</Pill>}{r.history?.length > 0 && !status && <span className="edited-dot" title={app.t('st.edited')} />}{tag && <Pill tone="neutral">{tag}</Pill>}</span>
          <span className="row-sub">{r.no && <span className="row-no num">{docNo(r, app.farm.settings)}</span>}{dayLabel(r.day, app.lang)} · {hideParty ? d.kind : (d.sub || d.kind)}</span>
        </span>
        <span className={`row-amt num ${dir > 0 ? 'in' : dir < 0 ? 'out' : ''}`}>
          {right ?? (d.amountC != null ? `${dir > 0 ? '+' : dir < 0 ? '−' : ''}${app.fmt(d.amountC).replace('−', '')}` : d.qty)}
        </span>
      </button>
    </div>
  );
}

/** Excel-style selection: a floating bar summarising the selected rows. */
export function SelectionBar({ selected, clear, totalC }) {
  const { t, ui, fmt, actor } = useApp();
  if (!selected.length) return null;
  return (
    <div className="sel-bar" role="status">
      <span>{t('ed.selected', { n: selected.length })}</span>
      {totalC != null && <b className="num">{fmt(totalC)}</b>}
      <Button size="sm" onClick={clear}>{t('cancel')}</Button>
      {can(actor?.role, 'money.delete') && <Button size="sm" variant="danger" icon="trash" onClick={() => ui.open('delete', { ids: selected, onDone: clear })}>{t('delete')}</Button>}
    </div>
  );
}
