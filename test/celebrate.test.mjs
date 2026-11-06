import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { addRecord, deleteRecords, restoreRecords } from '../src/core/commands.mjs';
import { compute } from '../src/core/ledger.mjs';
import { pickCelebration } from '../src/core/celebrate.mjs';

const T = '2026-11-02';
const f0 = () => sampleFarm('en', T);
const me = (f) => f.profiles.find((p) => p.role === 'owner');

test('milk, eggs and sales each get their moment', () => {
  const f = f0();
  const m = addRecord(f, { type: 'milk', day: T, species: 'cow', session: 'am', liters: 40 }, me(f));
  assert.deepEqual(pickCelebration(f, m), { kind: 'milk', am: 40, pm: 0 });
  const e = addRecord(f, { type: 'eggs', day: T, count: 30, broken: 2 }, me(f));
  assert.deepEqual(pickCelebration(f, e), { kind: 'eggs', n: 28 });
  const s = addRecord(f, { type: 'sale', day: T, lines: [{ product: 'milk', qty: 10, unit: 'L', priceC: 100 }], paidC: 1000, totalC: 1000, method: 'cash' }, me(f));
  assert.equal(pickCelebration(f, s).kind, 'sale');
});

test('paying a customer’s whole balance is a “paid up” moment; part of it is a payment', () => {
  const f = f0();
  const snap = compute(f, { to: '9999-12-31' });
  const [id, c] = Object.entries(snap.cust).find(([, x]) => x.dueC > 0);
  const part = addRecord(f, { type: 'payment', day: T, customerId: id, cashC: 100, method: 'cash' }, me(f));
  assert.equal(pickCelebration(f, part).kind, 'payment');
  const all = addRecord(f, { type: 'payment', day: T, customerId: id, cashC: c.dueC, method: 'cash' }, me(f));
  assert.deepEqual({ ...pickCelebration(f, all) }, { kind: 'clear', party: 'customer', id, amountC: c.dueC });
});

test('undo and restore do not celebrate; nothing new, nothing shown', () => {
  const f = f0();
  const r = f.records.find((x) => x.type === 'sale' && !x.deletedAt);
  const gone = deleteRecords(f, [r.id], me(f), 'test');
  assert.equal(pickCelebration(f, gone), null);
  assert.equal(pickCelebration(gone, restoreRecords(gone, [r.id], me(f))), null);
  assert.equal(pickCelebration(f, f), null);
});
