// One farm, every money flow, and every screen's figure checked against the others.
// The rule: a cost is counted once — when it is incurred (the bill). Paying the bill later
// moves cash and settles the bill; it never adds a second expense.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFarm, addRecord, upsert, updateSettings } from '../src/core/commands.mjs';
import { compute, saleTotals } from '../src/core/ledger.mjs';
import { periodReport } from '../src/core/reports.mjs';
import { trialBalance, profitAndLoss, balanceSheet, payablesAging, receivablesAging } from '../src/core/accounts.mjs';
import { saveOrder, receiveDelivery } from '../src/core/orders.mjs';

const owner = { id: 'o', name: 'Owner', role: 'owner' };
const D = '2026-10-';
const sale = (f, day, customerId, qty, priceC, paidNow) => {
  const lines = [{ product: 'milk', qty, unit: 'L', priceC, amountC: qty * priceC }];
  const tot = saleTotals({ lines }, f.settings.tax);
  return addRecord(f, { type: 'sale', day, customerId, lines, ...tot, paidNowC: paidNow === 'all' ? tot.totalC : paidNow, method: 'cash' }, owner);
};

export function busyFarm({ tax = false } = {}) {
  let f = emptyFarm();
  f = updateSettings(f, { setupDone: true, ...(tax ? { tax: { enabled: true, rate: 11, inclusive: false } } : {}) });
  f = upsert(f, 'customers', { id: 'c1', name: 'Shop', openingC: 5000 }, owner);
  f = upsert(f, 'suppliers', { id: 's1', name: 'Feed Co', openingC: 7000 }, owner);
  f = upsert(f, 'people', { id: 'p1', name: 'Partner' }, owner);
  f = addRecord(f, { type: 'capital', day: `${D}01`, kind: 'inject', personId: 'p1', amountC: 200000, account: 'cash' }, owner);
  f = addRecord(f, { type: 'milk', day: `${D}01`, session: 'am', species: 'cow', liters: 500 }, owner);
  f = sale(f, `${D}02`, null, 40, 100, 'all');                  // walk-in, cash
  f = sale(f, `${D}03`, 'c1', 100, 100, 3000);                   // on account, part paid
  f = addRecord(f, { type: 'payment', day: `${D}10`, customerId: 'c1', cashC: 4000, offsets: [{ category: 'fuel', amountC: 1500 }] }, owner);
  // Expenses: paid now, unpaid with no supplier, supplier bill unpaid, supplier bill part-paid, paid from a partner's pocket.
  f = addRecord(f, { type: 'expense', day: `${D}04`, category: 'fuel', amountC: 2500, paidC: 2500, source: 'cash' }, owner);
  f = addRecord(f, { type: 'expense', day: `${D}05`, category: 'electricity', amountC: 3000, paidC: 0, source: 'cash' }, owner);
  f = addRecord(f, { type: 'expense', day: `${D}05`, category: 'feed', amountC: 40000, paidC: 0, source: 'cash', supplierId: 's1' }, owner);
  f = addRecord(f, { type: 'expense', day: `${D}06`, category: 'hay', amountC: 10000, paidC: 4000, source: 'cash', supplierId: 's1' }, owner);
  f = addRecord(f, { type: 'expense', day: `${D}07`, category: 'repairs', amountC: 6000, paidC: 6000, source: 'person', personId: 'p1' }, owner);
  // Paying suppliers later: against a named bill, then general.
  const feedBill = f.records.find((r) => r.category === 'feed').id;
  f = addRecord(f, { type: 'supplierPay', day: `${D}12`, supplierId: 's1', billId: feedBill, amountC: 40000, source: 'cash' }, owner);
  f = addRecord(f, { type: 'supplierPay', day: `${D}13`, supplierId: 's1', amountC: 9000, source: 'cash' }, owner);
  f = addRecord(f, { type: 'medicine', day: `${D}08`, animalId: null, kind: 'vitamins', name: 'AD3E', costC: 1200 }, owner);
  // A purchase order received and billed.
  f = saveOrder(f, { supplierId: 's1', day: `${D}14`, lines: [{ category: 'feed', qty: 10, unit: 'bag', priceC: 1000 }] }, owner);
  const o = f.orders[0];
  f = receiveDelivery(f, o.id, { day: `${D}15`, lines: [{ lineId: o.lines[0].id, qty: 10 }], paid: 'none' }, owner);
  return f;
}

for (const tax of [false, true]) {
  test(`departments agree with each other${tax ? ' (with tax)' : ''}`, () => {
    const f = busyFarm({ tax });
    const s = compute(f);
    const tb = trialBalance(f);
    const bs = balanceSheet(f);
    assert.ok(tb.balanced, 'journal balances');
    assert.ok(bs.balanced, 'balance sheet balances');

    // Cash: the box, the journal and the report all say the same.
    const cashRow = tb.rows.find((r) => r.acct === 'cash');
    assert.equal(s.cashC, cashRow.balance, 'cash box = journal cash');
    const rep = periodReport(f, `${D}01`, `${D}31`);
    assert.equal(rep.cash.closingC, s.cashC, 'report closing cash = cash box');

    // Expenses are counted once: the Expenses list, the report and the P&L agree,
    // and paying a supplier never adds to them.
    const pl = profitAndLoss(f, { from: `${D}01`, to: `${D}31` });
    const listed = s.expenses.reduce((a, e) => a + e.amountC, 0);
    assert.equal(listed, pl.expenseC, 'Expenses screen total = P&L expenses');
    assert.equal(rep.expenseC, pl.expenseC, 'report expenses = P&L expenses');
    assert.equal(rep.profitC, pl.profitC, 'report profit = P&L profit');
    assert.equal(s.expenseC, pl.expenseC, 'snapshot expenses = P&L expenses');
    assert.ok(!s.expenses.some((e) => e.recordType === 'supplierPay'), 'supplier payments are not expenses');

    // What we owe: one figure everywhere.
    const owe = s.supplierDueC + s.payablesC;
    assert.equal(payablesAging(f, s, { today: `${D}31` }).totals.total, owe, 'payables aging = open bills');
    assert.equal(bs.liabilities.payable + bs.liabilities.bills, owe, 'balance sheet payables = open bills');
    assert.equal(rep.payableC, owe, 'report payables = open bills');

    // Each supplier bill shows what has really been paid on it, including later payments.
    const openRows = s.expenses.filter((e) => (e.origin === 'farm' || e.origin === 'supplier') && e.paidC < e.amountC);
    const openSum = openRows.reduce((a, e) => a + e.amountC - e.paidC, 0);
    const openingDue = Object.values(s.sup).reduce((a, v) => a + (v.openingDueC || 0), 0);
    assert.equal(openSum + openingDue, owe, 'open bills on the Expenses screen add up to what we owe');
    assert.equal(s.expenses.find((e) => e.category === 'feed' && e.day === `${D}05`).paidC, 40000, 'a bill paid later shows as paid');

    // Customers: receivable on the cash box = aging = balance sheet.
    assert.equal(receivablesAging(f, s, { today: `${D}31` }).totals.total, s.receivableC, 'receivable aging = receivable');
    assert.equal(bs.assets.receivable, s.receivableC, 'balance sheet receivable = receivable');
  });
}
