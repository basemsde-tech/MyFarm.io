import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { compute, saleTotals } from '../src/core/ledger.mjs';
import { emptyFarm, addRecord, upsert, deleteRecords, voidSale, editRecord, updateSettings } from '../src/core/commands.mjs';
import { journal, trialBalance, profitAndLoss, balanceSheet, receivablesAging, payablesAging, taxSummary, invoiceRegister, entryFor } from '../src/core/accounts.mjs';
import { buildWalkthroughFarm } from './fixtures/old-walkthrough.mjs';
import { importLegacy } from '../src/core/legacy.mjs';

const owner = { id: 'p1', name: 'Basem', role: 'owner' };
const TODAY = '2026-10-29';

/** Every way the books must tie to the screens. */
function tie(f, today = TODAY) {
  const s = compute(f);
  const tb = trialBalance(f);
  assert.equal(tb.totalDr, tb.totalCr, 'journal must balance');
  for (const e of journal(f)) assert.equal(e.lines.reduce((a, l) => a + l.dr - l.cr, 0), 0, `entry ${e.id} balances`);
  const bal = (k) => tb.rows.find((r) => r.acct === k)?.balance || 0;
  const party = (k, p) => tb.rows.find((r) => r.acct === k)?.parties.get(p) || 0;
  assert.equal(bal('cash'), s.cashC, 'cash box');
  assert.equal(bal('bank'), s.bankC, 'bank');
  for (const c of f.customers) assert.equal(party('ar', c.id), (s.cust[c.id]?.dueC || 0) - (s.cust[c.id]?.creditBalC || 0), `customer ${c.name}`);
  for (const x of f.suppliers) assert.equal(0 - party('ap', x.id), (s.sup[x.id]?.dueC || 0) - (s.sup[x.id]?.creditBalC || 0), `supplier ${x.name}`);
  for (const p of f.people) assert.equal(0 - party('owed', p.id), s.people[p.id]?.owedC || 0, `person ${p.name}`);
  assert.equal(0 - bal('bills'), s.payablesC, 'unpaid bills');
  const bs = balanceSheet(f);
  assert.equal(bs.balanced, true, 'assets = liabilities + equity');
  const ra = receivablesAging(f, s, { today, termsDays: f.settings.termsDays });
  assert.equal(ra.totals.total, s.receivableC, 'receivables aging ties to the cash box');
  for (const r of ra.rows) assert.equal(r.current + r.d30 + r.d60 + r.d90 + r.d90p, r.total);
  const pa = payablesAging(f, s, { today });
  assert.equal(pa.totals.total, s.supplierDueC + s.payablesC, 'payables aging ties');
  return { s, tb, bs };
}

test('sample farm: journal balances and every account ties to the screens', () => {
  const f = sampleFarm('en', TODAY);
  const { s, bs } = tie(f);
  assert.equal(bs.assets.cash, s.cashC);
  assert.equal(bs.assets.receivable, s.receivableC);
  const pl = profitAndLoss(f, { from: '0000-00-00', to: '9999-12-31' });
  assert.equal(pl.incomeC, s.revenueC, 'income equals sales when there is no tax');
  assert.equal(pl.expenseC, s.expenseC, 'expenses equal the expense screen');
  assert.equal(bs.equity.earnings, pl.profitC);
});

test('restored 2.x farm ties too', () => {
  const { farm } = importLegacy(buildWalkthroughFarm({ now: Date.parse('2026-10-20T12:00:00') }));
  tie(farm, '2026-10-20');
});

test('invoices and receipts get sequential numbers that are never reused', () => {
  let f = emptyFarm();
  f = upsert(f, 'customers', { id: 'c1', name: 'Ahmad' }, owner);
  const sale = (n) => { const b = { type: 'sale', day: '2026-10-0' + n, customerId: 'c1', lines: [{ product: 'cheese', qty: 1, unit: 'kg', priceC: 1000 }], discount: { kind: 'amount', valueC: 0 }, paidNowC: 0 }; const t = saleTotals(b); return { ...b, lines: b.lines.map((l, i) => ({ ...l, amountC: t.lineAmounts[i] })), totalC: t.totalC }; };
  f = addRecord(f, sale(1), owner);
  f = addRecord(f, sale(2), owner);
  f = addRecord(f, { type: 'payment', day: '2026-10-03', customerId: 'c1', cashC: 500, offsets: [] }, owner);
  assert.deepEqual(f.records.map((r) => r.no), [1, 2, 1]);
  f = deleteRecords(f, [f.records[1].id], owner, 'mistake');
  f = addRecord(f, sale(4), owner);
  assert.equal(f.records.at(-1).no, 3);
  const id = f.records[0].id;
  f = editRecord(f, id, { paidNowC: 200 }, owner, 'partly paid');
  assert.equal(f.records.find((r) => r.id === id).no, 1);
  const reg = invoiceRegister(f, compute(f), { today: '2026-12-01', termsDays: 30 });
  assert.deepEqual(reg.map((r) => r.no), [3, 1]);
  assert.equal(reg.find((r) => r.no === 1).status, 'overdue');
});

test('tax: revenue excludes tax, tax is owed, both inclusive and exclusive', () => {
  for (const inclusive of [false, true]) {
    let f = updateSettings(emptyFarm(), { tax: { enabled: true, rate: 10, inclusive } });
    f = upsert(f, 'customers', { id: 'c1', name: 'Ahmad' }, owner);
    const base = { type: 'sale', day: '2026-10-05', customerId: 'c1', lines: [{ product: 'cheese', qty: 2, unit: 'kg', priceC: 1100 }], discount: { kind: 'amount', valueC: 0 }, paidNowC: 0 };
    const t = saleTotals(base, f.settings.tax);
    f = addRecord(f, { ...base, lines: base.lines.map((l, i) => ({ ...l, amountC: t.lineAmounts[i] })), totalC: t.totalC, taxC: t.taxC }, owner);
    tie(f);
    const pl = profitAndLoss(f, { from: '2026-10-01', to: '2026-10-31' });
    const ts = taxSummary(f, { from: '2026-10-01', to: '2026-10-31' });
    assert.equal(pl.incomeC + ts.taxC, t.totalC);
    assert.equal(ts.taxC, inclusive ? 200 : 220);
    assert.equal(balanceSheet(f).liabilities.tax, ts.taxC);
  }
});

test('voided sales and deleted records leave the books', () => {
  const f = sampleFarm('en', TODAY);
  const s1 = f.records.find((r) => r.type === 'sale' && r.customerId);
  const v = voidSale(f, s1.id, 'restore', 'returned', owner);
  assert.equal(entryFor(v.records.find((r) => r.id === s1.id)), null);
  tie(v);
  tie(deleteRecords(f, [s1.id], owner, 'x'));
});
