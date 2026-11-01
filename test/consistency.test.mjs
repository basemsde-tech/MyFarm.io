// Every figure the screens show must agree with the double-entry books, on any mix of entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { emptyFarm, addRecord, deleteRecords, voidSale, editRecord, upsert } from '../src/core/commands.mjs';
import { compute } from '../src/core/ledger.mjs';
import { trialBalance, balanceSheet, profitAndLoss } from '../src/core/accounts.mjs';
import { periodReport } from '../src/core/reports.mjs';
import { closeBefore } from '../src/core/danger.mjs';

const owner = { id: 'pro-owner', name: 'Owner', role: 'owner' };

function check(farm, label) {
  const s = compute(farm);
  const tb = trialBalance(farm);
  assert.ok(tb.balanced, `${label}: trial balance off by ${tb.totalDr - tb.totalCr}`);
  const bs = balanceSheet(farm);
  assert.ok(bs.balanced, `${label}: balance sheet off`);
  const bal = (k) => tb.rows.find((r) => r.acct === k)?.balance || 0;
  const party = (k, id) => tb.rows.find((r) => r.acct === k)?.parties.get(id) || 0;
  assert.equal(s.cashC + s.bankC, bal('cash') + bal('bank'), `${label}: cash box vs books`);
  assert.equal(s.cashC, s.flows.reduce((x, f) => x + (f.account === 'cash' ? f.dir * f.amountC : 0), 0), `${label}: cash vs its own movements`);
  for (const c of farm.customers) {
    const v = s.cust[c.id] || {};
    assert.equal((v.chargeC || 0) - (v.creditC || 0), party('ar', c.id), `${label}: customer ${c.name} balance vs books`);
  }
  for (const p of farm.suppliers) {
    const v = s.sup[p.id] || {};
    assert.equal((v.billC || 0) - (v.paidC || 0), 0 - party('ap', p.id) || 0, `${label}: supplier ${p.name} balance vs books`);
  }
  for (const p of farm.people) assert.equal(s.people[p.id]?.owedC || 0, 0 - party('owed', p.id) || 0, `${label}: person ${p.name} vs books`);
  assert.equal(s.payablesC, 0 - bal('bills') || 0, `${label}: open bills vs books`);
  // Expenses list (expenses page) = expense side of the P&L, for any period.
  const pl = profitAndLoss(farm, { from: '0000-00-00', to: '9999-12-31' });
  assert.equal(s.expenses.reduce((x, e) => x + e.amountC, 0), pl.expenseC, `${label}: expenses page vs P&L`);
  const rep = periodReport(farm, '0000-00-00', '9999-12-31');
  assert.equal(rep.expenseC, pl.expenseC, `${label}: report expenses vs P&L`);
  // Supplier bills: what is still due on the bills equals the supplier balance.
  // Milk: what was milked − sold − used − spoiled = tank (never negative).
  assert.ok(s.milk.stockL >= 0, `${label}: negative tank`);
  return s;
}

test('sample farm agrees with the books, in both languages', () => {
  for (const lang of ['ar', 'en']) check(sampleFarm(lang, '2026-11-02'), `sample-${lang}`);
});

test('random entries keep every screen in step with the books', () => {
  let seed = 7;
  const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const cents = (max) => 100 * Math.floor(R() * max) + Math.floor(R() * 100);
  for (let run = 0; run < 12; run++) {
    let f = emptyFarm();
    f = { ...f, settings: { ...f.settings, setupDone: true } };
    const cs = ['c1', 'c2', 'c3'], ss = ['s1', 's2'], ps = ['p1', 'p2'];
    cs.forEach((id, i) => { f = upsert(f, 'customers', { id, name: `C${i}`, openingC: i === 0 ? cents(50) : 0 }, owner); });
    ss.forEach((id, i) => { f = upsert(f, 'suppliers', { id, name: `S${i}`, openingC: i === 0 ? cents(80) : 0 }, owner); });
    ps.forEach((id, i) => { f = upsert(f, 'people', { id, name: `P${i}`, openingC: i === 1 ? cents(30) : 0 }, owner); });
    const ids = [];
    for (let i = 0; i < 120; i++) {
      const day = `2026-${String(1 + Math.floor(R() * 10)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`;
      const kind = pick(['sale', 'sale', 'payment', 'expense', 'expense', 'supplierPay', 'capital', 'medicine', 'milk', 'milkUse', 'delete', 'void', 'edit']);
      try {
        if (kind === 'sale') {
          const qty = 1 + Math.floor(R() * 40); const priceC = 50 + Math.floor(R() * 100); const totalC = qty * priceC;
          const cust = R() < 0.7 ? pick(cs) : null;
          f = addRecord(f, { type: 'sale', day, customerId: cust, lines: [{ product: pick(['milk', 'eggs', 'cheese']), qty, unit: 'L', priceC, amountC: totalC }], totalC, paidNowC: cust ? pick([0, totalC, Math.floor(totalC / 2), totalC + 500]) : totalC, method: 'cash' }, owner);
        } else if (kind === 'payment') {
          const off = R() < 0.3 ? [{ category: 'feed', amountC: cents(20), desc: 'x' }] : [];
          f = addRecord(f, { type: 'payment', day, customerId: pick(cs), cashC: cents(60), method: 'cash', keptBy: R() < 0.2 ? pick(ps) : null, offsets: off }, owner);
        } else if (kind === 'expense') {
          const amountC = cents(90) + 1; const src = pick(['cash', 'cash', 'person', 'customer']);
          const sup = R() < 0.5 && src !== 'customer' ? pick(ss) : null;
          f = addRecord(f, { type: 'expense', day, category: pick(['feed', 'vet', 'fuel', 'labor']), amountC, paidC: pick([0, amountC, Math.floor(amountC / 3)]), supplierId: sup, source: src, personId: src === 'person' ? pick(ps) : null, customerId: src === 'customer' ? pick(cs) : null, takenBy: src === 'cash' && !sup && R() < 0.2 ? pick(ps) : null }, owner);
        } else if (kind === 'supplierPay') {
          const src = pick(['cash', 'person']);
          f = addRecord(f, { type: 'supplierPay', day, supplierId: pick(ss), amountC: cents(70) + 1, source: src, personId: src === 'person' ? pick(ps) : null }, owner);
        } else if (kind === 'capital') {
          f = addRecord(f, { type: 'capital', day, kind: pick(['inject', 'withdraw']), purpose: pick(['farm', 'personal']), personId: pick(ps), amountC: cents(200) + 1, account: 'cash' }, owner);
        } else if (kind === 'medicine') {
          f = addRecord(f, { type: 'medicine', day, name: 'm', costC: pick([0, cents(10) + 1]) }, owner);
        } else if (kind === 'milk') {
          f = addRecord(f, { type: 'milk', day, species: 'cow', session: pick(['am', 'pm']), liters: Math.round(R() * 900) / 10 }, owner);
        } else if (kind === 'milkUse') {
          f = addRecord(f, { type: 'milkUse', day, liters: Math.round(R() * 100) / 10, reason: 'calves' }, owner);
        } else if (kind === 'delete' && ids.length) {
          f = deleteRecords(f, [pick(ids)], owner, 'test');
        } else if (kind === 'void') {
          const sale = f.records.filter((r) => r.type === 'sale' && !r.deletedAt && !r.voided);
          if (sale.length) f = voidSale(f, pick(sale).id, pick(['restore', 'writeoff']), 'test void', owner);
        } else if (kind === 'edit') {
          const ex = f.records.filter((r) => r.type === 'expense' && !r.deletedAt);
          if (ex.length) { const e = pick(ex); f = editRecord(f, e.id, { paidC: e.amountC }, owner, 'settle'); }
        }
      } catch (e) { if (e.name !== 'CommandError') throw e; }
      if (f.records.length) ids.push(f.records.at(-1).id);
    }
    check(f, `random-${run}`);
    // Closing old months must not change any balance.
    const before = compute(f);
    let closed;
    try { closed = closeBefore(f, '2026-06-01', owner, { now: '2026-11-02T10:00:00Z' }); } catch (e) { if (e.name === 'CommandError') continue; throw e; }
    const after = check(closed, `closed-${run}`);
    assert.equal(after.cashC, before.cashC, `closed-${run}: cash changed`);
    for (const c of cs) assert.equal((after.cust[c]?.dueC || 0) - (after.cust[c]?.creditBalC || 0), (before.cust[c]?.dueC || 0) - (before.cust[c]?.creditBalC || 0), `closed-${run}: customer ${c}`);
    for (const p of ss) assert.equal((after.sup[p]?.dueC || 0) - (after.sup[p]?.creditBalC || 0), (before.sup[p]?.dueC || 0) - (before.sup[p]?.creditBalC || 0), `closed-${run}: supplier ${p}`);
    for (const p of ps) assert.equal(after.people[p]?.owedC || 0, before.people[p]?.owedC || 0, `closed-${run}: person ${p}`);
    assert.equal(after.payablesC, before.payablesC, `closed-${run}: open bills`);
  }
});

test('report: product split adds up to net sales; milk by kg and litre is counted in litres', () => {
  let f = emptyFarm();
  f = addRecord(f, { type: 'sale', day: '2026-05-01', customerId: null, lines: [{ product: 'milk', qty: 103, unit: 'kg', priceC: 33, amountC: 3399 }, { product: 'milk', qty: 10, unit: 'L', priceC: 33, amountC: 330 }, { product: 'eggs', qty: 7, unit: 'egg', priceC: 13, amountC: 91 }], totalC: 3820 - 7, taxC: 0, paidNowC: 3813, method: 'cash' }, owner);
  const rep = periodReport(f, '2026-05-01', '2026-05-31');
  const sumC = Object.values(rep.byProduct).reduce((x, p) => x + p.amountC, 0);
  assert.equal(sumC, rep.netSalesC);
  assert.ok(Math.abs(rep.byProduct.milk.qty - 110) < 0.001, `milk litres ${rep.byProduct.milk.qty}`);
});

test('an egg shortfall does not swallow eggs collected later', async () => {
  const { eggStock } = await import('../src/core/milk.mjs');
  const s = eggStock([
    { id: 'a', type: 'eggUse', day: '2026-01-01', count: 10 },
    { id: 'b', type: 'eggs', day: '2026-01-02', count: 30, broken: 0 },
  ]);
  assert.equal(s.stock, 30);
  assert.equal(s.issues.length, 1);
});

test('monthly costs keep their day of the month', async () => {
  globalThis.window ??= undefined;
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/screens-money.jsx', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function nextDue'), src.indexOf('function Obligations'));
  const addDays = () => { throw new Error('weekly not used'); };
  const nextDue = new Function('addDays', `${body.replace('export function', 'return function')}`)(addDays);
  let d = '2026-01-31'; const seen = [];
  for (let i = 0; i < 4; i++) { d = nextDue(d, 'monthly', 31); seen.push(d); }
  assert.deepEqual(seen, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(nextDue('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(nextDue('2026-12-15', 'monthly'), '2027-01-15');
});
