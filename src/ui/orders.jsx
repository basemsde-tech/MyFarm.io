import React, { useMemo, useRef, useState } from 'react';
import { useApp, inFrame } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Seg, Select, TextInput, TextArea, DateInput, MoneyInput, QtyInput, Sheet, FilterPanel, Picker, dayLabel } from './kit.jsx';
import { orderList, orderStatus, saveOrder, receiveDelivery, cancelOrder, closeOrder, reopenOrder, poNo, lineTotalC, validateOrder } from '../core/orders.mjs';
import { orderText } from '../core/messages.mjs';
import { EXPENSE_GROUPS, CATEGORY_UNIT } from '../core/catalog.mjs';
import { fmtQty } from '../core/money.mjs';
import { can } from '../core/catalog.mjs';
import { ShareBar } from './share.jsx';
import { Attachments } from './documents.jsx';
import { Help } from './help.jsx';
import { DocBrand } from './brand.jsx';
import { downloadText } from './screens-money.jsx';
import { toCSV } from '../core/reports.mjs';

const UNITS = ['item', 'bag', 'kg', 'L', 'head', 'dose', 'unit'];
const blankLine = () => ({ category: 'feed', desc: '', qty: 0, unit: 'bag', priceC: 0 });

function useCats() {
  const { t, farm } = useApp();
  const custom = farm.settings.categories || [];
  const opts = Object.entries(EXPENSE_GROUPS).flatMap(([g, items]) => items.filter((c) => c !== 'opening' && c !== 'vendor').map((c) => ({ value: c, label: t(`c.${c}`) })));
  const name = (c) => custom.find((x) => x.key === c)?.name || t(`c.${c}`);
  return { opts: [...opts, ...custom.map((c) => ({ value: c.key, label: c.name, sub: t(`g.${c.group}`) }))], name };
}

/** Suppliers → Purchase orders. */
export function OrdersList({ supplierId }) {
  const { farm, t, fmt, ui, lang, names } = useApp();
  const [status, setStatus] = useState(supplierId ? 'all' : 'active');
  const [q, setQ] = useState('');
  const all = useMemo(() => orderList(farm).filter((o) => !supplierId || o.order.supplierId === supplierId), [farm, supplierId]);
  const rows = all.filter((o) => (status === 'all' || (status === 'active' ? ['open', 'partial'].includes(o.status) : o.status === status))
    && (!q || `${poNo(o.order, farm.settings)} ${names.supplier(o.order.supplierId)} ${o.order.lines.map((l) => l.desc).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const openC = all.filter((o) => ['open', 'partial'].includes(o.status)).reduce((s, o) => s + o.lines.reduce((a, l) => a + Math.round(l.openQty * (l.priceC || 0)), 0), 0);
  const late = all.filter((o) => o.late).length;
  const exportCSV = () => downloadText('purchase-orders.csv', toCSV([[t('po.no'), t('exp.supplier'), t('date'), t('po.expected'), t('po.ordered'), t('po.billed'), t('status')],
    ...rows.map((o) => [poNo(o.order, farm.settings), names.supplier(o.order.supplierId), o.order.day, o.order.expectedDay || '', o.orderedC / 100, o.billedC / 100, t(`po.st.${o.status}`)])]));
  return (
    <>
      {!supplierId && (
        <section className="stats-row">
          <Stat label={t('po.active')} value={String(all.filter((o) => ['open', 'partial'].includes(o.status)).length)} onClick={() => setStatus('active')} />
          <Stat label={t('po.toReceive')} value={fmt(openC)} />
          <Stat label={t('po.late')} value={String(late)} tone={late ? 'out' : null} />
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>{t('po.title')} <Help k="orders" more="suppliers" /></h2>
          <Button size="sm" variant="primary" icon="plus" onClick={() => ui.open('order', { supplierId })}>{t('po.new')}</Button>
        </div>
        <FilterPanel id={`orders-${supplierId || 'all'}`} onReset={() => { setStatus(supplierId ? 'all' : 'active'); setQ(''); }} extra={<Button size="sm" icon="download" onClick={exportCSV}>{t('rep.csv')}</Button>}
          chips={[{ label: status === 'all' ? t('all') : status === 'active' ? t('po.active') : t(`po.st.${status}`), active: status !== (supplierId ? 'all' : 'active') }, q && { label: `“${q}”`, active: true }]}>
          <div className="filter-row">
            <input className="input search" placeholder={t('po.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
            <Seg small label={t('status')} value={status} onChange={setStatus} options={['active', 'all', 'open', 'partial', 'received', 'closed', 'cancelled'].map((k) => ({ value: k, label: k === 'all' ? t('all') : k === 'active' ? t('po.active') : t(`po.st.${k}`) }))} />
          </div>
        </FilterPanel>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl po-tbl">
              <thead><tr><th>{t('po.no')}</th>{!supplierId && <th>{t('exp.supplier')}</th>}<th>{t('date')}</th><th>{t('po.expected')}</th><th>{t('po.progress')}</th><th className="num">{t('po.ordered')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {rows.map((o) => {
                  const q1 = o.lines.reduce((a, l) => a + (+l.qty || 0), 0);
                  const q2 = o.lines.reduce((a, l) => a + Math.min(+l.qty || 0, l.receivedQty), 0);
                  return (
                    <tr key={o.order.id} className={`clickable ${o.status === 'cancelled' ? 'is-void' : ''}`} onClick={() => ui.open('orderView', { id: o.order.id })}>
                      <td className="num"><b>{poNo(o.order, farm.settings)}</b><div className="muted small">{o.order.lines.length} {t('items')}</div></td>
                      {!supplierId && <td>{names.supplier(o.order.supplierId)}</td>}
                      <td className="num">{dayLabel(o.order.day, lang)}</td>
                      <td className={`num ${o.late ? 'out' : ''}`}>{o.order.expectedDay ? dayLabel(o.order.expectedDay, lang) : '—'}</td>
                      <td><span className="po-bar"><span style={{ inlineSize: `${q1 ? Math.min(100, (q2 / q1) * 100) : 0}%` }} /></span></td>
                      <td className="num">{fmt(o.orderedC)}</td>
                      <td><Pill tone={{ open: 'info', partial: 'warn', received: 'good', closed: 'neutral', cancelled: 'neutral' }[o.status]}>{t(`po.st.${o.status}`)}</Pill>{o.late && <Pill tone="bad">{t('po.lateOne')}</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title={t('po.none')} body={t('po.noneHint')} icon="truck" action={<Button variant="primary" icon="plus" onClick={() => ui.open('order', { supplierId })}>{t('po.new')}</Button>} />}
      </section>
    </>
  );
}

/** Create / edit a purchase order. */
export function OrderSheet({ record, supplierId: preset, onClose }) {
  const { farm, t, fmt, today, commit, actor, ui } = useApp();
  const cats = useCats();
  const [f, setF] = useState(record ? { ...record, lines: record.lines.map((l) => ({ ...l })) } : { supplierId: preset || '', day: today, expectedDay: '', note: '', lines: [blankLine()] });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setLine = (i, p) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const st = record ? orderStatus(farm, record) : null;
  const received = (id) => st?.lines.find((l) => l.id === id)?.receivedQty || 0;
  const issues = validateOrder(f);
  const total = f.lines.reduce((s, l) => s + lineTotalC(l), 0);
  const save = () => {
    let newId = null;
    const ok = commit((x) => { const n = saveOrder(x, f, actor); newId = record ? record.id : n.orders[n.orders.length - 1].id; return n; }, { label: record ? t('po.updated') : t('po.created') });
    if (ok) { onClose(); if (!record && newId) ui.open('orderView', { id: newId }); }
  };
  const suppliers = farm.suppliers.filter((s) => !s.archived || s.id === f.supplierId).map((s) => ({ value: s.id, label: s.name }));
  return (
    <Sheet title={record ? `${t('edit')} · ${poNo(record, farm.settings)}` : t('po.new')} onClose={onClose} wide
      footer={<div className="foot-btns"><span className="foot-total num">{t('total')}: <b>{fmt(total)}</b></span><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={issues.some((i) => i.severity === 'error')} onClick={save}>{t('save')}</Button></div>}>
      <div className="grid3">
        <Picker label={t('exp.supplier')} value={f.supplierId} onChange={(v) => set({ supplierId: v })} options={suppliers} disabled={!!st?.deliveries.length} />
        <DateInput label={t('po.date')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
        <DateInput label={`${t('po.expected')} (${t('optional')})`} value={f.expectedDay} onChange={(v) => set({ expectedDay: v })} />
      </div>
      <div className="po-lines">
        {f.lines.map((l, i) => (
          <div className="po-line" key={l.id || i}>
            <Picker label={t('exp.item')} value={l.category} onChange={(v) => setLine(i, { category: v, unit: CATEGORY_UNIT[v] || l.unit })} options={cats.opts} />
            <TextInput label={`${t('po.desc')} (${t('optional')})`} value={l.desc} onChange={(v) => setLine(i, { desc: v })} />
            <QtyInput label={t('qty')} value={l.qty} onValue={(v) => setLine(i, { qty: v })} />
            <Select label={t('unit')} value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={UNITS.map((u) => ({ value: u, label: t(`u.${u}`) }))} />
            <MoneyInput label={t('price')} cents={l.priceC} onCents={(c) => setLine(i, { priceC: c })} />
            <div className="po-line-end">
              <span className="num">{fmt(lineTotalC(l))}</span>
              {received(l.id) > 0 ? <span className="muted small">{t('po.receivedQ', { q: fmtQty(received(l.id)) })}</span>
                : f.lines.length > 1 && <Button size="sm" variant="quiet" icon="trash" aria-label={t('delete')} onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })} />}
            </div>
          </div>
        ))}
        <Button icon="plus" onClick={() => set({ lines: [...f.lines, { ...blankLine(), category: f.lines[f.lines.length - 1]?.category || 'feed', unit: f.lines[f.lines.length - 1]?.unit || 'bag' }] })}>{t('sale.addLine')}</Button>
      </div>
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
      <p className="muted small">{t('po.hint')}</p>
    </Sheet>
  );
}

/** One order: matching, deliveries, actions, printable document. */
export function OrderView({ id, onClose }) {
  const { farm, t, fmt, lang, ui, commit, actor, names } = useApp();
  const cats = useCats();
  const docRef = useRef(null);
  const o = (farm.orders || []).find((x) => x.id === id);
  if (!o) return null;
  const st = orderStatus(farm, o);
  const s = farm.settings;
  const sup = farm.suppliers.find((x) => x.id === o.supplierId);
  const number = poNo(o, s);
  const canAct = can(actor?.role, 'money.create');
  const active = ['open', 'partial'].includes(st.status);
  const long = (d) => dayLabel(d, lang, { day: 'numeric', month: 'long', year: 'numeric' });
  const reason = (key, fn) => ui.open('reason', { title: t(key), onOk: (r) => commit((x) => fn(x, r), { label: t('saved') }) });
  return (
    <Sheet title={`${t('po.title1')} ${number}`} sub={names.supplier(o.supplierId)} onClose={onClose} wide
      footer={<div className="foot-btns doc-foot-btns">
        <ShareBar getEl={() => docRef.current} fileName={`${number}.pdf`} phone={sup?.phone} text={orderText({ farm, o, supplier: sup, t, fmt, lang, number, catName: cats.name })} />
        {!inFrame && <Button icon="print" onClick={() => window.print()}>{t('print')}</Button>}
      </div>}>
      <div className="po-head">
        <Pill tone={{ open: 'info', partial: 'warn', received: 'good', closed: 'neutral', cancelled: 'neutral' }[st.status]}>{t(`po.st.${st.status}`)}</Pill>
        {st.late && <Pill tone="bad">{t('po.lateOne')}</Pill>}
        <div className="row-btns">
          {canAct && active && <Button variant="primary" icon="truck" onClick={() => ui.open('receive', { id })}>{t('po.receive')}</Button>}
          {canAct && !['cancelled'].includes(st.status) && <Button icon="edit" onClick={() => ui.open('order', { record: o })}>{t('edit')}</Button>}
          {canAct && st.status === 'partial' && <Button onClick={() => reason('po.closeQ', (x, r) => closeOrder(x, id, actor, r))}>{t('po.close')}</Button>}
          {canAct && st.status === 'open' && <Button variant="danger" onClick={() => reason('po.cancelQ', (x, r) => cancelOrder(x, id, actor, r))}>{t('po.cancel')}</Button>}
          {canAct && ['closed', 'cancelled'].includes(st.status) && <Button icon="undo" onClick={() => commit((x) => reopenOrder(x, id, actor), { label: t('saved') })}>{t('po.reopen')}</Button>}
        </div>
      </div>
      <section className="po-match">
        <h3>{t('po.matching')} <Help k="matching" /></h3>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t('exp.item')}</th><th className="num">{t('po.ordered')}</th><th className="num">{t('po.received')}</th><th className="num">{t('po.open')}</th><th className="num">{t('po.billed')}</th><th className="num">{t('po.diff')}</th></tr></thead>
            <tbody>
              {st.lines.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.desc || cats.name(l.category)}</b><div className="muted small">{cats.name(l.category)} · {fmt(l.priceC)} / {t(`u.${l.unit}`)}</div></td>
                  <td className="num">{fmtQty(l.qty)} {t(`u.${l.unit}`)}</td>
                  <td className={`num ${l.over ? 'out' : ''}`}>{fmtQty(l.receivedQty)}</td>
                  <td className="num">{l.openQty ? fmtQty(l.openQty) : '—'}</td>
                  <td className="num">{fmt(l.billedC)}</td>
                  <td className={`num ${l.priceDiffC > 0 ? 'out' : l.priceDiffC < 0 ? 'in' : 'muted'}`}>{l.priceDiffC ? `${l.priceDiffC > 0 ? '+' : '−'}${fmt(Math.abs(l.priceDiffC))}` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>{t('total')}</td><td className="num">{fmt(st.orderedC)}</td><td /><td /><td className="num">{fmt(st.billedC)}</td><td className="num">{st.priceDiffC ? `${st.priceDiffC > 0 ? '+' : '−'}${fmt(Math.abs(st.priceDiffC))}` : '—'}</td></tr></tfoot>
          </table>
        </div>
        {st.lines.some((l) => l.over) && <div className="note warn"><Icon name="alert" size={16} />{t('po.overNote')}</div>}
      </section>
      <section>
        <h3>{t('po.deliveries')}</h3>
        {st.deliveries.length ? st.deliveries.map((d) => (
          <div className="po-delivery" key={d.deliveryId}>
            <div className="pd-head"><b>{long(d.day)}</b>{d.deliveryNo && <span className="row-no num">{t('po.dn')} {d.deliveryNo}</span>}<span className="num">{fmt(d.totalC)}</span><Pill tone={d.paidC >= d.totalC ? 'good' : d.paidC ? 'warn' : 'neutral'}>{d.paidC >= d.totalC ? t('st.paid') : d.paidC ? t('st.partial') : t('st.unpaid')}</Pill></div>
            {d.bills.map((b) => (
              <button type="button" className="pd-line" key={b.id} onClick={() => ui.open('drawer', { id: b.id })}>
                <span>{b.note || cats.name(b.category)}</span><span className="num">{fmtQty(b.qty)} {t(`u.${b.unit}`)}</span><span className="num">{fmt(b.amountC)}</span>
              </button>
            ))}
          </div>
        )) : <p className="muted small">{t('po.noDeliveries')}</p>}
        {st.deliveries.some((d) => d.paidC < d.totalC) && <Button size="sm" icon="cash" onClick={() => ui.open('supplierPay', { supplierId: o.supplierId })}>{t('sup.pay')}</Button>}
      </section>
      {(o.cancelReason || o.closeReason) && <p className="muted small">{t('reason')}: {o.cancelReason || o.closeReason}</p>}
      <Attachments list="orders" id={o.id} title={t('po.docs')} />
      <article className="print-doc" ref={docRef} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <header className="doc-head">
          <div className="doc-farm">
            <DocBrand />
            <div><b>{s.farmName || t('brand')}</b><div>{[s.farmPhone, s.farmAddress].filter(Boolean).join(' · ')}</div></div>
          </div>
          <div className="doc-title"><h1>{t('po.title1')}</h1><b className="doc-no num">{number}</b></div>
        </header>
        <div className="doc-meta">
          <div className="doc-billto"><span className="doc-lbl">{t('exp.supplier')}</span><b>{sup?.name || '—'}</b>{sup?.phone && <span>{sup.phone}</span>}</div>
          <div className="doc-facts">
            <span>{t('po.date')}</span><span>{long(o.day)}</span>
            {o.expectedDay && <><span>{t('po.expected')}</span><span>{long(o.expectedDay)}</span></>}
          </div>
        </div>
        <table className="doc-table">
          <thead><tr><th>#</th><th>{t('exp.item')}</th><th className="num">{t('qty')}</th><th className="num">{t('price')}</th><th className="num">{t('total')}</th></tr></thead>
          <tbody>{o.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td>{l.desc || cats.name(l.category)}</td><td className="num">{fmtQty(l.qty)} {t(`u.${l.unit}`)}</td><td className="num">{fmt(l.priceC)}</td><td className="num">{fmt(lineTotalC(l))}</td></tr>)}</tbody>
        </table>
        <div className="doc-totals"><div className="grand"><span>{t('total')}</span><span className="num">{fmt(st.orderedC)}</span></div></div>
        {o.note && <p>{o.note}</p>}
        {s.doc.signatures && <div className="sigs"><span>{t('po.orderedBy')}</span><span>{t('exp.supplier')}</span></div>}
      </article>
    </Sheet>
  );
}

/** Receive a delivery against an order. */
export function ReceiveSheet({ id, onClose }) {
  const { farm, t, fmt, today, commit, actor, names } = useApp();
  const cats = useCats();
  const o = (farm.orders || []).find((x) => x.id === id);
  const st = o ? orderStatus(farm, o) : null;
  const [f, setF] = useState({ day: today, deliveryNo: '', paid: 'none', source: 'cash', personId: '', dueDay: '', note: '',
    lines: st ? st.lines.map((l) => ({ lineId: l.id, qty: l.openQty, amountC: null })) : [] });
  if (!o) return null;
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const setLine = (i, p) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const amount = (i) => (f.lines[i].amountC != null ? f.lines[i].amountC : Math.round((+f.lines[i].qty || 0) * (st.lines[i].priceC || 0)));
  const total = f.lines.reduce((s, _, i) => s + (+f.lines[i].qty > 0 ? amount(i) : 0), 0);
  const people = farm.people.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name }));
  const save = () => {
    const ok = commit((x) => receiveDelivery(x, id, { ...f, personId: f.personId || null, lines: f.lines.map((l, i) => ({ ...l, amountC: l.amountC != null ? l.amountC : null, qty: +l.qty || 0 })).filter((l) => l.qty > 0).map((l) => ({ ...l, amountC: l.amountC ?? undefined })) }, actor), { label: t('po.receivedOk') });
    if (ok) onClose();
  };
  return (
    <Sheet title={`${t('po.receive')} · ${poNo(o, farm.settings)}`} sub={names.supplier(o.supplierId)} onClose={onClose} wide
      footer={<div className="foot-btns"><span className="foot-total num">{t('total')}: <b>{fmt(total)}</b></span><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={!total || (f.paid === 'full' && f.source === 'person' && !f.personId)} onClick={save}>{t('po.receive')}</Button></div>}>
      <div className="grid3">
        <DateInput label={t('po.recDate')} value={f.day} max={today} onChange={(v) => set({ day: v })} />
        <TextInput label={`${t('po.dnNo')} (${t('optional')})`} value={f.deliveryNo} onChange={(v) => set({ deliveryNo: v })} />
        {f.paid === 'none' && <DateInput label={`${t('exp.due')} (${t('optional')})`} value={f.dueDay} onChange={(v) => set({ dueDay: v })} />}
      </div>
      <div className="po-lines">
        {st.lines.map((l, i) => (
          <div className="po-rec" key={l.id}>
            <div className="pr-name"><b>{l.desc || cats.name(l.category)}</b><span className="muted small">{t('po.orderedQ', { q: fmtQty(l.qty), u: t(`u.${l.unit}`) })} · {t('po.receivedQ', { q: fmtQty(l.receivedQty) })}</span></div>
            <QtyInput label={t('po.nowQ')} value={f.lines[i].qty} onValue={(v) => setLine(i, { qty: v })} unit={t(`u.${l.unit}`)} />
            <MoneyInput label={t('po.billedAmt')} cents={amount(i)} onCents={(c) => setLine(i, { amountC: c })} hint={f.lines[i].amountC != null && f.lines[i].amountC !== Math.round((+f.lines[i].qty || 0) * (l.priceC || 0)) ? t('po.priceChanged') : `${fmt(l.priceC)} / ${t(`u.${l.unit}`)}`} />
          </div>
        ))}
      </div>
      <Seg label={t('exp.paid')} value={f.paid} onChange={(v) => set({ paid: v })} options={[{ value: 'none', label: t('po.payLater') }, { value: 'full', label: t('po.payNow') }]} />
      {f.paid === 'full' && (
        <div className="grid2">
          <Seg label={t('exp.source')} value={f.source} onChange={(v) => set({ source: v })} options={[{ value: 'cash', label: t('exp.src.cash') }, { value: 'person', label: t('exp.src.person') }]} />
          {f.source === 'person' && <Select label={t('exp.person')} value={f.personId} onChange={(v) => set({ personId: v })} options={people} placeholder={t('select')} />}
        </div>
      )}
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
      <p className="muted small">{t('po.recHint')}</p>
    </Sheet>
  );
}

/** Ask for a short reason, then run onOk(reason). */
export function ReasonSheet({ title, onOk, onClose }) {
  const { t } = useApp();
  const [r, setR] = useState('');
  return (
    <Sheet title={title} onClose={onClose}
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={r.trim().length < 3} onClick={() => { onOk(r.trim()); onClose(); }}>{t('confirm')}</Button></div>}>
      <TextInput label={t('reason')} hint={t('ed.reasonHint')} value={r} onChange={setR} autoFocus />
    </Sheet>
  );
}
