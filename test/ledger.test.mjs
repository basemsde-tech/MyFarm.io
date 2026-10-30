import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCents, toCents, fmtMoney, normDigits } from '../src/core/money.mjs';
import { compute, saleTotals, customerInvoices, supplierBills } from '../src/core/ledger.mjs';
import { emptyFarm, addRecord, editRecord, deleteRecords, restoreRecords, purgeRecords, voidSale, unvoidSale, upsert, preview, updateSettings, autoPurge, CommandError } from '../src/core/commands.mjs';
import { validateRecord, findDuplicate } from '../src/core/validate.mjs';
import { partyLines, statement } from '../src/core/statement.mjs';
import { mergeFarms } from '../src/core/sync.mjs';
import { readBackup, backupEnvelope } from '../src/core/backup.mjs';
import { milkStock, kgToL } from '../src/core/milk.mjs';
import { reproTimeline } from '../src/core/species.mjs';

const owner = { id: 'p1', name: 'Basem', role: 'owner' };
const book = { id: 'p2', name: 'Rana', role: 'book' };
const milker = { id: 'p3', name: 'Ali', role: 'milker' };
const D = '2026-10-10';

function farm() {
  let f = emptyFarm();
  f = upsert(f, 'customers', { id: 'c1', name: 'Ahmad' }, owner);
  f = upsert(f, 'suppliers', { id: 's1', name: 'Feed Co' }, owner);
  f = upsert(f, 'people', { id: 'm1', name: 'Khaled' }, owner);
  return f;
}
const sale = (over = {}) => {
  const base = { type: 'sale', day: D, lines: [{ product: 'milk', qty: 10, unit: 'L', priceC: 100 }], discount: { kind: 'amount', valueC: 0 }, method: 'cash', ...over };
  const t = saleTotals(base);
  return { ...base, lines: base.lines.map((l, i) => ({ ...l, amountC: t.lineAmounts[i] })), totalC: t.totalC, ...over.totals };
};
const milk = (session, liters, day = D) => ({ type: 'milk', day, session, species: 'cow', liters });

test('money parses without floating drift and accepts Arabic digits', () => {
  assert.equal(parseCents('0.1').cents + parseCents('0.2').cents, 30);
  assert.equal(parseCents('١٢٫٥').cents, 1250);
  assert.equal(parseCents('1,234.567').cents, 123457);
  assert.equal(parseCents('abc').ok, false);
  assert.equal(parseCents('').empty, true);
  assert.equal(toCents(19.99), 1999);
  assert.equal(normDigits('٣ ٤'), '34');
  assert.equal(fmtMoney(123456), '$1,234.56');
  assert.equal(fmtMoney(100, { view: 'second', second: { code: 'LBP', rate: 89500 } }), '89,500 LBP');
});

test('1. milk: am + pm, sale in kg, farm use; tank = production − both, in litres', () => {
  let f = farm();
  f = addRecord(f, milk('am', 60), milker);
  f = addRecord(f, milk('pm', 40), milker);
  f = addRecord(f, sale({ customerId: null, lines: [{ product: 'milk', qty: 10.3, unit: 'kg', priceC: 100 }], paidNowC: 1030 }), milker);
  f = addRecord(f, { type: 'milkUse', day: D, liters: 5, reason: 'calves' }, milker);
  const s = compute(f);
  assert.equal(s.milk.producedL, 100);
  assert.equal(s.milk.stockL, 85);
  assert.equal(Math.round(kgToL(10.3) * 1000) / 1000, 10);
});

test('milk dedupe: bulk sessions beat per-animal rows; re-entered session keeps latest', () => {
  let f = farm();
  f = addRecord(f, { type: 'milk', day: D, session: 'am', species: 'cow', liters: 8, animalId: 'a1' }, milker);
  f = addRecord(f, milk('am', 50), milker);
  f = addRecord(f, { ...milk('am', 55), createdAt: '2099-01-01T00:00:00Z' }, milker);
  assert.equal(compute(f).milk.producedL, 55);
});

test('overselling milk is reported as an error in preview', () => {
  let f = addRecord(farm(), milk('am', 5), milker);
  const p = preview(f, (x) => addRecord(x, sale({ customerId: 'c1', paidNowC: 0 }), owner));
  assert.equal(p.ok, false);
  assert.equal(p.issues[0].code, 'milk.oversell');
});

test('2. walk-in sale collects cash, no customer due; short tender rejected', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  const s1 = sale({ customerId: null, paidNowC: 1000, tenderC: 2000 });
  assert.deepEqual(validateRecord(s1, { today: D }), []);
  f = addRecord(f, s1, milker);
  const s = compute(f);
  assert.equal(s.cashC, 1000);
  assert.equal(s.receivableC, 0);
  const bad = validateRecord(sale({ customerId: null, paidNowC: 500, tenderC: 500 }), { today: D }).map((i) => i.code);
  assert.ok(bad.includes('walkin.mustPayFull'));
});

test('3. account sale unpaid, partial payment, then clearing payment marks sale paid', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: 'c1', paidNowC: 0 }), owner);
  f = addRecord(f, { type: 'payment', day: D, customerId: 'c1', cashC: 400, method: 'cash', offsets: [] }, owner);
  let s = compute(f);
  assert.equal(s.cust.c1.dueC, 600);
  assert.equal(f.records.filter((r) => r.type === 'payment').length, 1);
  assert.equal(customerInvoices(f, 'c1', s)[0].status, 'partial');
  f = addRecord(f, { type: 'payment', day: D, customerId: 'c1', cashC: 600, method: 'cash', offsets: [] }, owner);
  s = compute(f);
  assert.equal(s.cust.c1.dueC, 0);
  assert.equal(customerInvoices(f, 'c1', s)[0].status, 'paid');
});

test('4. payment with fuel offset: due drops by cash+offset, cash only by cash, paid fuel expense', () => {
  let f = addRecord(farm(), milk('am', 200), milker);
  f = addRecord(f, sale({ customerId: 'c1', lines: [{ product: 'milk', qty: 100, unit: 'L', priceC: 100 }], paidNowC: 0 }), owner);
  f = addRecord(f, { type: 'payment', day: D, customerId: 'c1', cashC: 5000, method: 'cash', offsets: [{ category: 'fuel', amountC: 5000, desc: 'Diesel for pickup' }] }, owner);
  const s = compute(f);
  assert.equal(s.cust.c1.dueC, 0);
  assert.equal(s.cashC, 5000);
  const fuel = s.expenses.find((e) => e.category === 'fuel');
  assert.equal(fuel.amountC, 5000);
  assert.equal(fuel.paidC, 5000);
  assert.equal(fuel.origin, 'customer');
  assert.ok(validateRecord({ type: 'payment', day: D, customerId: 'c1', cashC: 10, offsets: [] }, { dueC: 0 }).some((i) => i.code === 'pay.overDue'));
});

test('5. supplier bill paid in part; opening balance behaves as a bill', () => {
  let f = upsert(farm(), 'suppliers', { id: 's1', openingC: 20000 }, owner);
  f = addRecord(f, { type: 'expense', day: D, category: 'feed', amountC: 30000, paidC: 10000, supplierId: 's1', source: 'cash' }, owner);
  let s = compute(f);
  assert.equal(s.sup.s1.dueC, 40000);
  assert.equal(s.cashC, -10000);
  f = addRecord(f, { type: 'supplierPay', day: D, supplierId: 's1', amountC: 20000, source: 'cash' }, owner);
  s = compute(f);
  assert.equal(s.sup.s1.dueC, 20000);
  const { bills } = supplierBills(f, 's1');
  assert.equal(bills[0].opening, true);
  assert.equal(bills[0].status, 'paid');
  assert.equal(bills[1].dueC, 20000);
});

test('6. manager pays a supplier from pocket: supplier due falls, drawer unchanged, person owed more', () => {
  let f = addRecord(farm(), { type: 'expense', day: D, category: 'feed', amountC: 30000, paidC: 0, supplierId: 's1', source: 'cash' }, owner);
  f = addRecord(f, { type: 'supplierPay', day: D, supplierId: 's1', amountC: 30000, source: 'person', personId: 'm1' }, owner);
  const s = compute(f);
  assert.equal(s.sup.s1.dueC, 0);
  assert.equal(s.cashC, 0);
  assert.equal(s.people.m1.owedC, 30000);
});

test('7. owner injects capital, spends some on feed, withdraws the rest', () => {
  let f = addRecord(farm(), { type: 'capital', kind: 'inject', personId: 'm1', amountC: 100000, day: D, account: 'cash' }, owner);
  f = addRecord(f, { type: 'expense', day: D, category: 'feed', amountC: 40000, paidC: 40000, source: 'cash', capital: true }, owner);
  f = addRecord(f, { type: 'capital', kind: 'withdraw', purpose: 'return', personId: 'm1', amountC: 60000, day: D, account: 'cash' }, owner);
  const s = compute(f);
  assert.equal(s.cashC, 0);
  assert.equal(s.capitalC, 0);
  assert.equal(s.expenseC, 40000);
  assert.equal(s.people.m1.owedC, 40000);
});

test('retained customer collection: revenue skipped drawer, farm owes person less', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: 'c1', paidNowC: 0 }), owner);
  f = addRecord(f, { type: 'payment', day: D, customerId: 'c1', cashC: 1000, keptBy: 'm1', offsets: [] }, owner);
  const s = compute(f);
  assert.equal(s.cashC, 0);
  assert.equal(s.cust.c1.dueC, 0);
  assert.equal(s.people.m1.owedC, -1000);
});

test('8. void milk sale with restore and write-off, then undo both', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: null, paidNowC: 1000, id: 'sale1' }), owner);
  assert.equal(compute(f).milk.stockL, 40);
  assert.throws(() => voidSale(f, 'sale1', 'restore', 'no', owner), CommandError);
  let r = voidSale(f, 'sale1', 'restore', 'customer returned', owner);
  assert.equal(compute(r).milk.stockL, 50);
  assert.equal(compute(r).cashC, 0);
  let w = voidSale(f, 'sale1', 'writeoff', 'spilled on road', owner);
  assert.equal(compute(w).milk.stockL, 40);
  assert.equal(compute(w).cashC, 0);
  assert.equal(compute(unvoidSale(r, 'sale1', owner)).cashC, 1000);
  assert.equal(compute(unvoidSale(w, 'sale1', owner)).milk.stockL, 40);
});

test('9. statement opening, charges, credits and closing match the account card', () => {
  let f = addRecord(farm(), milk('am', 100, '2026-09-01'), milker);
  f = addRecord(f, sale({ customerId: 'c1', day: '2026-09-05', paidNowC: 0 }), owner);
  f = addRecord(f, sale({ customerId: 'c1', day: '2026-10-05', paidNowC: 300 }), owner);
  f = addRecord(f, { type: 'payment', day: '2026-10-06', customerId: 'c1', cashC: 200, offsets: [{ category: 'fuel', amountC: 100, desc: 'fuel' }] }, owner);
  const st = statement(partyLines(f, 'customer', 'c1'), { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(st.openingC, 1000);
  assert.equal(st.chargesC, 1000);
  assert.equal(st.creditsC, 600);
  assert.equal(st.closingC, compute(f).cust.c1.dueC);
  assert.equal(st.rows.at(-1).balanceC, st.closingC);
});

test('edit a sale amount: account due and cash move together, revision kept, reason required', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: 'c1', paidNowC: 500, id: 'x1' }), owner);
  assert.throws(() => editRecord(f, 'x1', { paidNowC: 800 }, owner, ''), /reasonRequired/);
  const g = editRecord(f, 'x1', { paidNowC: 800 }, owner, 'typed wrong amount');
  assert.equal(compute(g).cust.c1.dueC, 200);
  assert.equal(compute(g).cashC, 800);
  const rec = g.records.find((r) => r.id === 'x1');
  assert.equal(rec.history.length, 1);
  assert.equal(rec.history[0].before.paidNowC, 500);
  const p = preview(f, (x) => editRecord(x, 'x1', { paidNowC: 800 }, owner, 'typed wrong amount'));
  assert.deepEqual(p.impact.find((i) => i.key === 'cash'), { key: 'cash', before: 500, after: 800, ref: undefined, kind: 'money' });
});

test('editing a milk sale cannot make the tank negative', () => {
  let f = addRecord(farm(), milk('am', 12), milker);
  f = addRecord(f, sale({ customerId: 'c1', paidNowC: 0, id: 'x1' }), owner);
  const lines = [{ product: 'milk', qty: 20, unit: 'L', priceC: 100, amountC: 2000 }];
  const p = preview(f, (x) => editRecord(x, 'x1', { lines, totalC: 2000 }, owner, 'more milk'));
  assert.equal(p.ok, false);
});

test('delete a payment: soft, restorable, invoice stays; purge is owner-only', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: 'c1', paidNowC: 0 }), owner);
  f = addRecord(f, { type: 'payment', id: 'pay1', day: D, customerId: 'c1', cashC: 1000, offsets: [{ category: 'fuel', amountC: 0, desc: '' }].slice(0, 0) }, owner);
  const p = preview(f, (x) => deleteRecords(x, ['pay1'], owner, 'wrong customer'));
  assert.ok(p.impact.some((i) => i.key === 'cash' && i.after === 0));
  const g = p.next;
  assert.equal(compute(g).cust.c1.dueC, 1000);
  assert.equal(g.records.filter((r) => r.type === 'sale' && !r.deletedAt).length, 1);
  assert.equal(compute(restoreRecords(g, ['pay1'], owner)).cust.c1.dueC, 0);
  assert.throws(() => purgeRecords(g, ['pay1'], book), /forbidden/);
  const h = purgeRecords(g, ['pay1'], owner);
  assert.equal(h.records.some((r) => r.id === 'pay1'), false);
  assert.equal(h.tombstones[0].id, 'pay1');
});

test('auto purge removes trash older than 30 days only', () => {
  let f = addRecord(farm(), milk('am', 5), milker);
  const id = f.records[0].id;
  f = deleteRecords(f, [id], owner, 'x', Date.parse('2026-01-01'));
  assert.equal(autoPurge(f, Date.parse('2026-01-20')).records.length, 1);
  assert.equal(autoPurge(f, Date.parse('2026-02-15')).records.length, 0);
});

test('locked month rejects edits from non-owners, owner edit is marked', () => {
  let f = addRecord(farm(), { type: 'expense', id: 'e1', day: '2026-09-15', category: 'fuel', amountC: 1000, paidC: 1000, source: 'cash' }, owner);
  f = updateSettings(f, { lockedThrough: '2026-09-30' });
  f = addRecord(f, { type: 'milk', id: 'm9', day: '2026-09-15', session: 'am', liters: 3 }, owner);
  assert.throws(() => editRecord(f, 'm9', { liters: 4 }, milker, 'fix fix'), /locked/);
  const g = editRecord(f, 'e1', { amountC: 2000, paidC: 2000 }, owner, 'late correction');
  assert.equal(g.records.find((r) => r.id === 'e1').editedAfterClose, true);
  assert.throws(() => addRecord(f, { type: 'milk', day: '2026-09-02', session: 'am', liters: 3 }, milker), /locked/);
});

test('milker can record sales but cannot edit money', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  f = addRecord(f, sale({ customerId: null, paidNowC: 1000, id: 's9' }), milker);
  assert.throws(() => editRecord(f, 's9', { paidNowC: 900 }, milker, 'mistake'), /forbidden/);
  assert.throws(() => addRecord(f, { type: 'expense', day: D, category: 'fuel', amountC: 5, paidC: 5 }, milker), /forbidden/);
});

test('discount cannot exceed net; tax inclusive and exclusive', () => {
  const lines = [{ product: 'cheese', qty: 2, unit: 'kg', priceC: 1100 }];
  assert.equal(saleTotals({ lines, discount: { kind: 'amount', valueC: 5000 } }).totalC, 0);
  assert.equal(saleTotals({ lines, discount: { kind: 'percent', value: 10 } }).totalC, 1980);
  const inc = saleTotals({ lines }, { enabled: true, rate: 10, inclusive: true });
  assert.equal(inc.totalC, 2200);
  assert.equal(inc.taxC, 200);
  assert.equal(saleTotals({ lines }, { enabled: true, rate: 10, inclusive: false }).totalC, 2420);
});

test('duplicate detection', () => {
  let f = addRecord(farm(), milk('am', 50), milker);
  assert.ok(findDuplicate(f, milk('am', 50)));
  assert.equal(findDuplicate(f, milk('pm', 50)), undefined);
});

test('11. sync merge: newer per-record edits win both ways; purged rows stay gone', () => {
  let base = addRecord(farm(), milk('am', 50), milker);
  const id = base.records[0].id;
  const A = editRecord(base, id, { liters: 52 }, owner, 'scale fix', Date.parse('2027-10-11'));
  let B = addRecord(base, milk('pm', 30), milker, Date.parse('2027-10-12'));
  const m = mergeFarms(A, B);
  assert.equal(m.records.find((r) => r.id === id).liters, 52);
  assert.equal(m.records.length, 2);
  const m2 = mergeFarms(B, A);
  assert.equal(m2.records.find((r) => r.id === id).liters, 52);
  const del = purgeRecords(deleteRecords(A, [id], owner, 'x'), [id], owner);
  assert.equal(mergeFarms(B, del).records.some((r) => r.id === id), false);
});

test('backup envelope round-trips and rejects unknown files', () => {
  const f = addRecord(farm(), milk('am', 5), milker);
  const env = JSON.stringify(backupEnvelope(f));
  assert.equal(readBackup(env).farm.records.length, 1);
  assert.equal(readBackup('{"x":1}').ok, false);
  const legacy = readBackup({ settings: { farmName: 'Old' }, entries: [{ type: 'sale', at: D, amount: 12.5, customerId: 'cust-walkin' }, { type: 'mystery', at: D }] });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.report.mapped, 1);
  assert.equal(legacy.report.skipped, 1);
  assert.equal(compute(legacy.farm).cust['cust-walkin'].dueC, 1250);
  assert.equal(legacy.report.ok, true);
});

test('FIFO freshness consumes oldest lot first', () => {
  let f = farm();
  f = addRecord(f, milk('am', 10, '2026-10-01'), milker);
  f = addRecord(f, milk('am', 10, '2026-10-03'), milker);
  f = addRecord(f, { type: 'milkUse', day: '2026-10-03', liters: 4, reason: 'calves' }, milker);
  const st = milkStock(f.records, Date.parse('2026-10-03T12:00:00'));
  assert.equal(st.lots[0].day, '2026-10-01');
  assert.equal(st.lots[0].left, 6);
  assert.equal(st.lots[1].fresh, 'fresh');
});

test('reproduction timeline for a cow', () => {
  const t = reproTimeline('cow', '2026-01-01', '2026-02-20');
  assert.equal(t.due, '2026-10-11');
  assert.equal(t.next, 'pregCheck');
  assert.equal(reproTimeline('cow', '2026-01-01', '2026-02-20', 'pregnant').next, 'dryOff');
});

test('no bank: older bank entries fold into the cash box and transfers drop', async () => {
  const { foldBank } = await import('../src/core/commands.mjs');
  const { normalise } = await import('../src/core/backup.mjs');
  const f = normalise({ ...emptyFarm(), records: [
    { id: 'a', type: 'capital', kind: 'inject', purpose: 'capital', personId: 'p', amountC: 1000, account: 'bank', day: '2026-01-01', createdAt: '1' },
    { id: 'b', type: 'transfer', fromAccount: 'bank', amountC: 400, day: '2026-01-02', createdAt: '2' },
    { id: 'c', type: 'expense', category: 'fuel', amountC: 300, paidC: 300, source: 'bank', day: '2026-01-03', createdAt: '3' },
  ], people: [{ id: 'p', name: 'P' }] });
  assert.equal(f.records.some((r) => r.type === 'transfer'), false);
  const s = compute(f);
  assert.equal(s.bankC, 0);
  assert.equal(s.cashC, 700);
  assert.equal(foldBank(f), f, 'already folded farms are returned unchanged');
});
