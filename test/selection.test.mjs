import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarise, measureOf } from '../src/core/selection.mjs';

const L = (o) => ({ type: 'sale', typeLabel: 'Sale', label: 'Sale', amountC: null, ...o });

test('one kind of line: total, average, largest, smallest', () => {
  const s = summarise([L({ amountC: 1000 }), L({ amountC: 250 }), L({ amountC: 4000 })]);
  assert.deepEqual(s.head, { kind: 'money', value: 5250, label: 'total' });
  assert.equal(s.stats.max, 4000); assert.equal(s.stats.min, 250); assert.equal(s.stats.avg, 1750);
});

test('cash in and out: net, with in and out apart', () => {
  const s = summarise([L({ amountC: 1000, sign: 1 }), L({ type: 'expense', typeLabel: 'Expense', label: 'Feed', amountC: 300, sign: -1 })]);
  assert.equal(s.head.label, 'net'); assert.equal(s.head.value, 700); assert.equal(s.inC, 1000); assert.equal(s.outC, 300);
});

test('all money out: total is negative, not a net', () => {
  const s = summarise([L({ amountC: 100, sign: -1 }), L({ amountC: 50, sign: -1 })]);
  assert.equal(s.head.label, 'total'); assert.equal(s.head.value, -150);
});

test('mixed kinds without signs: no single total, one figure per kind', () => {
  const s = summarise([L({ amountC: 500 }), L({ type: 'payment', typeLabel: 'Payment', label: 'Payment', amountC: 200, sign: 1 })]);
  assert.equal(s.head, null);
  assert.deepEqual(s.types.map((g) => [g.name, g.amountC]), [['Sale', 500], ['Payment', 200]]);
});

test('voided and superseded lines are counted but not added', () => {
  const s = summarise([L({ amountC: 500 }), L({ amountC: 900, skip: true })]);
  assert.equal(s.n, 2); assert.equal(s.skipped, 1); assert.equal(s.head.value, 500);
});

test('quantities: litres and eggs, with extras summed', () => {
  const milk = [{ type: 'milk', liters: 12.5 }, { type: 'milk', liters: 7.25 }].map((r) => ({ type: 'milk', typeLabel: 'Milk', label: 'Milk', amountC: null, ...measureOf(r) }));
  const s = summarise(milk);
  assert.deepEqual(s.head, { kind: 'qty', value: 19.75, unit: 'L', label: 'total' });
  assert.deepEqual(measureOf({ type: 'eggs', count: 30, broken: 2 }), { qty: 28, unit: 'egg' });
  const b = summarise([L({ amountC: 1000, extras: { due: { label: 'Due', c: 400 } } }), L({ amountC: 600, extras: { due: { label: 'Due', c: 0 } } })]);
  assert.deepEqual(b.extras, [{ label: 'Due', c: 400 }]);
});
