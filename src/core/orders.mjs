// Purchase orders and deliveries.
// An order moves no money: it is what the farm asked a supplier for. Each delivery
// received against it becomes an ordinary supplier bill (an expense record with
// orderId / orderLineId / deliveryNo), so balances, aging and accounts need no new rules.
// Matching compares ordered, received and billed per line.

import { addRecord, newId, CommandError } from './commands.mjs';
import { can } from './catalog.mjs';
import { isoDay } from './species.mjs';

const nowIso = (now) => (now ? new Date(now) : new Date()).toISOString();
const live = (r) => !r.deletedAt;
export const lineTotalC = (l) => Math.round((+l.qty || 0) * (l.priceC || 0));
export const orderTotalC = (o) => (o.lines || []).reduce((s, l) => s + lineTotalC(l), 0);

export function poNo(o, settings = {}) {
  return o?.no ? `${settings.doc?.poPrefix || 'PO-'}${String(o.no).padStart(4, '0')}` : '';
}

/** Bills received against an order (live only). */
export function orderBills(farm, orderId) {
  return (farm.records || []).filter((r) => live(r) && r.type === 'expense' && r.orderId === orderId);
}

/**
 * Where an order stands: per line ordered / received / billed, deliveries, and a status.
 * Status: cancelled · closed (closed short by hand) · received · partial · open.
 */
export function orderStatus(farm, o) {
  const bills = orderBills(farm, o.id);
  const lines = (o.lines || []).map((l) => {
    const got = bills.filter((b) => b.orderLineId === l.id);
    const receivedQty = Math.round(got.reduce((s, b) => s + (+b.qty || 0), 0) * 1000) / 1000;
    const billedC = got.reduce((s, b) => s + (b.amountC || 0), 0);
    const expectC = Math.round(receivedQty * (l.priceC || 0));
    return { ...l, totalC: lineTotalC(l), receivedQty, openQty: Math.max(0, Math.round(((+l.qty || 0) - receivedQty) * 1000) / 1000), billedC, priceDiffC: billedC - expectC, over: receivedQty > (+l.qty || 0) };
  });
  const deliveries = [];
  for (const b of bills.slice().sort((x, y) => x.day.localeCompare(y.day) || String(x.createdAt).localeCompare(String(y.createdAt)))) {
    const key = `${b.day}|${b.deliveryNo || ''}|${b.deliveryId || b.id}`;
    let d = deliveries.find((x) => x.deliveryId && x.deliveryId === b.deliveryId);
    if (!d) { d = { key, deliveryId: b.deliveryId || b.id, day: b.day, deliveryNo: b.deliveryNo || '', bills: [], totalC: 0, paidC: 0 }; deliveries.push(d); }
    d.bills.push(b); d.totalC += b.amountC || 0; d.paidC += Math.min(b.paidC || 0, b.amountC || 0);
  }
  const orderedC = lines.reduce((s, l) => s + l.totalC, 0);
  const billedC = lines.reduce((s, l) => s + l.billedC, 0);
  const anyIn = lines.some((l) => l.receivedQty > 0);
  const allIn = lines.length > 0 && lines.every((l) => l.openQty <= 0);
  const status = o.cancelledAt ? 'cancelled' : allIn ? 'received' : o.closedAt ? 'closed' : anyIn ? 'partial' : 'open';
  return { order: o, lines, deliveries, orderedC, billedC, priceDiffC: lines.reduce((s, l) => s + l.priceDiffC, 0), status, late: status === 'open' || status === 'partial' ? !!(o.expectedDay && o.expectedDay < todayIso()) : false };
}
const todayIso = () => isoDay();

/** All orders, newest first, with their status. */
export function orderList(farm) {
  return (farm.orders || []).filter((o) => !o.deletedAt).map((o) => orderStatus(farm, o))
    .sort((a, b) => (b.order.no || 0) - (a.order.no || 0) || String(b.order.day).localeCompare(String(a.order.day)));
}

export function validateOrder(o) {
  const out = [];
  if (!o.supplierId) out.push({ code: 'supplier.required', field: 'supplierId', severity: 'error' });
  if (!o.day) out.push({ code: 'day.required', field: 'day', severity: 'error' });
  const lines = (o.lines || []).filter((l) => l.category || l.desc || l.qty);
  if (!lines.length) out.push({ code: 'po.noLines', field: 'lines', severity: 'error' });
  lines.forEach((l, i) => {
    if (!l.category) out.push({ code: 'category.required', field: `line${i}`, severity: 'error' });
    if (!(+l.qty > 0)) out.push({ code: 'qty.positive', field: `line${i}`, severity: 'error' });
    if (!(l.priceC >= 0)) out.push({ code: 'price.positive', field: `line${i}`, severity: 'error' });
  });
  return out;
}

function checkOrderPerm(actor) {
  if (!actor || !can(actor.role, 'money.create')) throw new CommandError('forbidden');
}

/** Create or edit an order. Lines already received cannot be removed. */
export function saveOrder(farm, input, actor, now) {
  checkOrderPerm(actor);
  const issues = validateOrder(input).filter((i) => i.severity === 'error');
  if (issues.length) throw new CommandError(issues[0].code);
  const at = nowIso(now);
  const lines = input.lines.filter((l) => l.category || l.desc || l.qty).map((l) => ({ id: l.id || newId('pl'), category: l.category, desc: (l.desc || '').trim(), qty: +l.qty, unit: l.unit || 'item', priceC: l.priceC || 0 }));
  const orders = farm.orders || [];
  const old = input.id && orders.find((o) => o.id === input.id);
  if (old) {
    const st = orderStatus(farm, old);
    for (const l of st.lines) if (l.receivedQty > 0 && !lines.some((x) => x.id === l.id)) throw new CommandError('po.lineReceived');
    const next = { ...old, supplierId: old.supplierId, day: input.day, expectedDay: input.expectedDay || '', note: input.note || '', lines, updatedAt: at, updatedBy: actor?.id || null,
      history: [...(old.history || []), { at, by: actor?.id || null, byName: actor?.name || '—', fields: ['lines'] }] };
    if (st.deliveries.length && input.supplierId !== old.supplierId) throw new CommandError('po.supplierLocked');
    next.supplierId = input.supplierId;
    return { ...farm, rev: (farm.rev || 0) + 1, orders: orders.map((o) => (o.id === old.id ? next : o)) };
  }
  const seq = { inv: 0, rct: 0, po: 0, ...(farm.settings.seq || {}) };
  seq.po += 1;
  const o = { id: input.id || newId('po'), no: seq.po, supplierId: input.supplierId, day: input.day, expectedDay: input.expectedDay || '', note: input.note || '', lines,
    createdAt: at, createdBy: actor?.id || null, createdByName: actor?.name || '—', updatedAt: at };
  return { ...farm, rev: (farm.rev || 0) + 1, settings: { ...farm.settings, seq }, orders: [...orders, o] };
}

function patchOrder(farm, id, patch, actor, now, reason) {
  checkOrderPerm(actor);
  const o = (farm.orders || []).find((x) => x.id === id);
  if (!o) throw new CommandError('notFound');
  const at = nowIso(now);
  const next = { ...o, ...patch(at), updatedAt: at, history: [...(o.history || []), { at, by: actor?.id || null, byName: actor?.name || '—', reason: reason || '' }] };
  return { ...farm, rev: (farm.rev || 0) + 1, orders: farm.orders.map((x) => (x.id === id ? next : x)) };
}

export const cancelOrder = (farm, id, actor, reason, now) => {
  const st = orderStatus(farm, (farm.orders || []).find((o) => o.id === id) || { lines: [] });
  if (st.deliveries.length) throw new CommandError('po.hasDeliveries');
  return patchOrder(farm, id, (at) => ({ cancelledAt: at, cancelReason: reason || '' }), actor, now, `cancel ${reason || ''}`);
};
export const closeOrder = (farm, id, actor, reason, now) => patchOrder(farm, id, (at) => ({ closedAt: at, closeReason: reason || '' }), actor, now, `close ${reason || ''}`);
export const reopenOrder = (farm, id, actor, now) => patchOrder(farm, id, () => ({ closedAt: null, cancelledAt: null }), actor, now, 'reopen');

/**
 * Receive a delivery. Each line received becomes a supplier bill (expense) at the agreed
 * price unless a different billed amount is given. paid: 'none' | 'full'.
 */
export function receiveDelivery(farm, orderId, { day, deliveryNo = '', lines = [], paid = 'none', source = 'cash', personId = null, dueDay = '', note = '' }, actor, now) {
  const o = (farm.orders || []).find((x) => x.id === orderId);
  if (!o) throw new CommandError('notFound');
  if (o.cancelledAt) throw new CommandError('po.cancelled');
  const got = lines.filter((l) => +l.qty > 0);
  if (!got.length) throw new CommandError('po.nothingReceived');
  const deliveryId = newId('dl');
  let next = farm;
  for (const g of got) {
    const l = o.lines.find((x) => x.id === g.lineId);
    if (!l) throw new CommandError('notFound');
    const amountC = g.amountC != null ? g.amountC : Math.round(+g.qty * (l.priceC || 0));
    next = addRecord(next, {
      type: 'expense', day, category: l.category, amountC, paidC: paid === 'full' ? amountC : 0, source: paid === 'full' ? source : 'cash', personId: paid === 'full' && source === 'person' ? personId : null,
      supplierId: o.supplierId, qty: +g.qty, unit: l.unit, unitPriceC: l.priceC, note: [l.desc, note].filter(Boolean).join(' · '),
      dueDay: paid === 'full' ? null : dueDay || null, orderId: o.id, orderLineId: l.id, deliveryId, deliveryNo: deliveryNo.trim(),
    }, actor, now);
  }
  return next;
}
