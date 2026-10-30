import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFarm, addRecord, upsert, editRecord, deleteRecords } from '../src/core/commands.mjs';
import { compute, supplierBills } from '../src/core/ledger.mjs';
import { saveOrder, receiveDelivery, orderStatus, cancelOrder, closeOrder, orderList, poNo } from '../src/core/orders.mjs';
import { intlPhone, waUrl, overdueCustomers, logReminder, reminderText } from '../src/core/messages.mjs';
import { addDocument, removeDocument, docsFor, expiringDocs, liveFileIds } from '../src/core/documents.mjs';
import { appendAudit, activityLog, changedLists } from '../src/core/audit.mjs';
import { normalise } from '../src/core/backup.mjs';
import { trialBalance } from '../src/core/accounts.mjs';

const owner = { id: 'o', name: 'Owner', role: 'owner' };
const worker = { id: 'w', name: 'Worker', role: 'worker' };
const t = (k, v) => (v ? `${k}${JSON.stringify(v)}` : k);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;

function withSupplier() {
  let f = emptyFarm();
  f = upsert(f, 'suppliers', { id: 's1', name: 'Feed Co', phone: '03 123 456' }, owner);
  return f;
}
const order = { supplierId: 's1', day: '2026-10-01', expectedDay: '2026-10-05', lines: [{ category: 'feed', desc: 'Dairy mix', qty: 40, unit: 'bag', priceC: 1800 }, { category: 'hay', qty: 10, unit: 'item', priceC: 500 }] };

test('purchase order: numbered, moves no money, receiving creates supplier bills', () => {
  let f = saveOrder(withSupplier(), order, owner);
  const o = f.orders[0];
  assert.equal(o.no, 1);
  assert.equal(poNo(o, f.settings), 'PO-0001');
  assert.equal(compute(f).supplierDueC, 0, 'an order alone owes nothing');
  assert.equal(orderStatus(f, o).status, 'open');
  assert.equal(orderStatus(f, o).orderedC, 40 * 1800 + 10 * 500);
  f = receiveDelivery(f, o.id, { day: '2026-10-04', deliveryNo: 'DN-77', lines: [{ lineId: o.lines[0].id, qty: 25 }] }, owner);
  let st = orderStatus(f, o);
  assert.equal(st.status, 'partial');
  assert.equal(st.lines[0].receivedQty, 25);
  assert.equal(st.lines[0].openQty, 15);
  assert.equal(st.deliveries.length, 1);
  assert.equal(st.deliveries[0].deliveryNo, 'DN-77');
  assert.equal(compute(f).sup.s1.dueC, 25 * 1800, 'the delivery is owed to the supplier');
  assert.equal(supplierBills(f, 's1', {}).bills.length, 1);
  // Second delivery billed at a different price and paid in cash on the spot.
  f = receiveDelivery(f, o.id, { day: '2026-10-06', lines: [{ lineId: o.lines[0].id, qty: 15, amountC: 15 * 1900 }, { lineId: o.lines[1].id, qty: 10 }], paid: 'full', source: 'cash' }, owner);
  st = orderStatus(f, o);
  assert.equal(st.status, 'received');
  assert.equal(st.priceDiffC, 15 * 100, 'billed above the agreed price');
  assert.equal(compute(f).sup.s1.dueC, 25 * 1800);
  assert.equal(compute(f).cashC, -(15 * 1900 + 10 * 500));
  assert.equal(trialBalance(f).balanced, true);
  assert.equal(orderList(f).length, 1);
});

test('orders: cancel only before deliveries, close short, permissions, deleting a bill reopens', () => {
  let f = saveOrder(withSupplier(), order, owner);
  const id = f.orders[0].id;
  assert.throws(() => saveOrder(f, order, worker), /forbidden/);
  const c = cancelOrder(f, id, owner, 'not needed');
  assert.equal(orderStatus(c, c.orders[0]).status, 'cancelled');
  assert.throws(() => receiveDelivery(c, id, { day: '2026-10-02', lines: [{ lineId: c.orders[0].lines[0].id, qty: 1 }] }, owner), /po.cancelled/);
  f = receiveDelivery(f, id, { day: '2026-10-02', lines: [{ lineId: f.orders[0].lines[0].id, qty: 40 }] }, owner);
  assert.throws(() => cancelOrder(f, id, owner, 'x'), /po.hasDeliveries/);
  const closed = closeOrder(f, id, owner, 'hay not available');
  assert.equal(orderStatus(closed, closed.orders[0]).status, 'closed');
  const bill = f.records.find((r) => r.orderId === id);
  const back = deleteRecords(f, [bill.id], owner, 'wrong');
  assert.equal(orderStatus(back, back.orders[0]).status, 'open');
  assert.throws(() => saveOrder(f, { ...f.orders[0], lines: [f.orders[0].lines[1]] }, owner), /po.lineReceived/);
});

test('phone numbers become WhatsApp links', () => {
  assert.equal(intlPhone('03 123 456'), '9613123456');
  assert.equal(intlPhone('+961 76 220 981'), '96176220981');
  assert.equal(intlPhone('0096171555210'), '96171555210');
  assert.equal(intlPhone('96171555210'), '96171555210');
  assert.equal(intlPhone('0412 345 678', '61'), '61412345678');
  assert.match(waUrl('03 123 456', 'Hello there'), /^https:\/\/wa\.me\/9613123456\?text=Hello%20there$/);
});

test('reminders: overdue customers, logged reminders, message text', () => {
  let f = emptyFarm();
  f.settings = { ...f.settings, farmName: 'Valley Farm' };
  f = upsert(f, 'customers', { id: 'c1', name: 'Hanan', phone: '76 220 981' }, owner);
  f = upsert(f, 'customers', { id: 'c2', name: 'Fadi' }, owner);
  const sale = (cid, day, totalC) => ({ type: 'sale', day, customerId: cid, lines: [{ product: 'milk', qty: totalC / 100, unit: 'L', priceC: 100, amountC: totalC }], discountC: 0, taxC: 0, totalC, paidNowC: 0, method: 'cash' });
  f = addRecord(f, { type: 'milk', day: '2026-08-01', species: 'cow', session: 'day', liters: 500 }, owner);
  f = addRecord(f, sale('c1', '2026-08-01', 5000), owner);
  f = addRecord(f, sale('c1', '2026-10-20', 2000), owner);
  f = addRecord(f, sale('c2', '2026-10-25', 1000), owner);
  const today = '2026-10-30';
  let rows = overdueCustomers(f, compute(f), { today, termsDays: 30 });
  assert.equal(rows.length, 1, 'only Hanan is late');
  assert.equal(rows[0].overdueC, 5000);
  assert.equal(rows[0].dueC, 7000);
  assert.equal(rows[0].remindNow, true);
  const txt = reminderText({ farm: f, row: rows[0], t, fmt, lang: 'en', number: (s) => `INV-${s.no}` });
  assert.match(txt, /Hanan/);
  assert.match(txt, /INV-1/);
  f = logReminder(f, 'c1', { at: '2026-10-29T10:00:00Z', actor: owner });
  rows = overdueCustomers(f, compute(f), { today, termsDays: 30, remindAfterDays: 7 });
  assert.equal(rows[0].remindNow, false, 'reminded yesterday');
  assert.equal(rows[0].reminders, 1);
});

test('documents: attach, expire, remove; activity log covers records and audit', () => {
  let f = emptyFarm();
  f = upsert(f, 'animals', { id: 'a1', species: 'cow', tag: '101', status: 'healthy' }, owner);
  f = addDocument(f, { owner: { list: 'animals', id: 'a1' }, kind: 'health', title: 'Health certificate', day: '2026-01-10', expiry: '2026-11-10', fileId: 'file-1', fileName: 'cert.pdf', mime: 'application/pdf', size: 1000 }, owner);
  f = addDocument(f, { owner: { list: 'animals', id: 'a1' }, kind: 'tag', title: 'Ear tag', day: '2025-05-01' }, owner);
  assert.equal(docsFor(f, 'animals', 'a1').length, 2);
  assert.equal(expiringDocs(f, '2026-10-30').length, 1);
  assert.equal(expiringDocs(f, '2026-10-30')[0].state, 'soon');
  assert.equal(expiringDocs(f, '2026-12-01')[0].state, 'expired');
  assert.deepEqual(liveFileIds(f), ['file-1']);
  f = removeDocument(f, f.documents[0].id, owner);
  assert.deepEqual(liveFileIds(f), []);
  assert.throws(() => addDocument(f, { owner: { list: 'nope', id: 'x' }, title: 'x' }, owner), /badList/);

  let g = addRecord(f, { type: 'expense', day: '2026-10-01', category: 'feed', amountC: 1000, paidC: 1000, source: 'cash' }, owner);
  const id = g.records[0].id;
  g = editRecord(g, id, { amountC: 1200, paidC: 1200 }, owner, 'price corrected');
  g = deleteRecords(g, [id], owner, 'duplicate');
  g = appendAudit(g, { kind: 'signin', by: 'o', byName: 'Owner' });
  const log = activityLog(g);
  assert.deepEqual(new Set(log.map((e) => e.kind)), new Set(['created', 'edited', 'deleted', 'signin']));
  assert.equal(log.find((e) => e.kind === 'edited').reason, 'price corrected');
  assert.deepEqual(changedLists(f, { ...f, documents: [] }), ['documents']);
  const n = normalise(g);
  assert.equal(n.settings.security.maxAttempts, 5, 'older farms get the new settings');
  assert.equal(n.documents.length, 2);
});
