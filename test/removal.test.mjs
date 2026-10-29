import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFarm, addRecord, upsert, restoreRecords } from '../src/core/commands.mjs';
import { compute, saleTotals } from '../src/core/ledger.mjs';
import { removeRecords, deleteMaster, restoreMaster, linkedRecords, produceOf, setArchived, visibleFarm } from '../src/core/removal.mjs';

const owner = { id: 'p1', name: 'Basem', role: 'owner' };
const D = '2026-10-10';
const sale = (o) => { const b = { type: 'sale', day: D, discount: { kind: 'amount', valueC: 0 }, method: 'cash', ...o }; const t = saleTotals(b); return { ...b, lines: b.lines.map((l, i) => ({ ...l, amountC: t.lineAmounts[i] })), totalC: t.totalC }; };
function farm() {
  let f = emptyFarm();
  f = upsert(f, 'customers', { id: 'c1', name: 'Ahmad' }, owner);
  f = upsert(f, 'animals', { id: 'a1', species: 'cow', tag: '7', status: 'lactating' }, owner);
  f = upsert(f, 'animals', { id: 'fl', species: 'chicken', tag: 'North', status: 'laying' }, owner);
  f = addRecord(f, { type: 'milk', day: D, session: 'am', species: 'cow', liters: 50 }, owner);
  f = addRecord(f, { type: 'milk', day: '2026-10-09', session: 'pm', species: 'cow', liters: 10, animalId: 'a1' }, owner);
  f = addRecord(f, { type: 'eggs', day: D, flockId: 'fl', count: 100, broken: 0 }, owner);
  f = addRecord(f, sale({ id: 's1', customerId: 'c1', lines: [{ product: 'milk', qty: 20, unit: 'L', priceC: 100 }, { product: 'eggs', qty: 30, unit: 'egg', priceC: 20 }], paidNowC: 0 }), owner);
  return f;
}

test('deleting a sale returns milk and eggs to stock by default', () => {
  const f = farm();
  assert.equal(compute(f).milk.stockL, 40);
  assert.deepEqual(produceOf(f.records.filter((r) => r.id === 's1')), { milkL: 20, eggs: 30 });
  const g = removeRecords(f, ['s1'], owner, 'wrong customer');
  assert.equal(compute(g).milk.stockL, 60);
  assert.equal(compute(g).eggs.stock, 100);
  assert.equal(compute(g).cust.c1?.dueC || 0, 0);
});

test('deleting a sale can keep produce out of stock, and restoring it removes the write-off', () => {
  const f = farm();
  const g = removeRecords(f, ['s1'], owner, 'milk was given away', { stock: 'keep' });
  const s = compute(g);
  assert.equal(s.milk.stockL, 40);
  assert.equal(s.eggs.stock, 70);
  assert.equal(s.cust.c1?.dueC || 0, 0);
  const back = restoreRecords(g, ['s1'], owner);
  assert.equal(compute(back).milk.stockL, 40);
  assert.equal(compute(back).eggs.stock, 70);
  assert.equal(compute(back).cust.c1.dueC, 2600);
});

test('a customer with entries can be archived but not deleted alone; deleting with entries is restorable', () => {
  const f = farm();
  assert.throws(() => deleteMaster(f, 'customers', 'c1', owner, { mode: 'only' }), /hasRecords/);
  const a = setArchived(f, 'customers', 'c1', true, owner);
  assert.equal(a.customers[0].archived, true);
  const g = deleteMaster(f, 'customers', 'c1', owner, { mode: 'withRecords', reason: 'duplicate' });
  assert.equal(visibleFarm(g).customers.length, 0);
  assert.equal(linkedRecords(g, 'customers', 'c1').length, 0);
  assert.equal(compute(g).milk.stockL, 60);
  const back = restoreMaster(g, 'customers', 'c1', owner);
  assert.equal(visibleFarm(back).customers.length, 1);
  assert.equal(compute(back).cust.c1.dueC, 2600);
});

test('deleting an animal keeps money and can take its herd rows with it', () => {
  let f = farm();
  f = addRecord(f, { type: 'medicine', day: D, animalId: 'a1', kind: 'vitamins', costC: 500 }, owner);
  f = addRecord(f, { type: 'animalEvent', day: D, animalId: 'a1', kind: 'weight', data: { weight: 500 } }, owner);
  const only = deleteMaster(f, 'animals', 'a1', owner, { mode: 'only' });
  assert.equal(compute(only).milk.producedL, 60);
  const all = deleteMaster(f, 'animals', 'a1', owner, { mode: 'withRecords' });
  const s = compute(all);
  assert.equal(s.milk.producedL, 50);
  assert.equal(s.cashC, -500); // the medicine cost stays
  assert.equal(compute(restoreMaster(all, 'animals', 'a1', owner)).milk.producedL, 60);
});
