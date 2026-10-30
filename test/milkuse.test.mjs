import { test } from 'node:test';
import assert from 'node:assert/strict';
import { milkUses, milkUseName, saveMilkUse, dropMilkUse } from '../src/core/catalog.mjs';

const t = (k) => ({ 'use.home': 'Home' }[k] || k);
let n = 0; const mk = () => `mu-${++n}`;

test('milk uses: built-ins, old plain names, add, rename, hide when used', () => {
  let s = { milkUseReasons: ['Cheese'] };
  assert.deepEqual(milkUses(s).map((x) => x.id), ['home', 'calves', 'waste', 'other', 'Cheese']);
  assert.equal(milkUseName(s, 'home', t), 'Home');
  assert.equal(milkUseName(s, 'Cheese', t), 'Cheese');
  s = { milkUseReasons: saveMilkUse(s, { name: '  Neighbours ', emoji: '🤝' }, mk) };
  const id = milkUses(s).at(-1).id;
  assert.equal(milkUseName(s, id, t), 'Neighbours');
  s = { milkUseReasons: saveMilkUse(s, { id, name: 'Family' }, mk) };
  assert.equal(milkUseName(s, id, t), 'Family');
  assert.equal(saveMilkUse(s, { name: 'family' }, mk).length, 2, 'no duplicate names');
  assert.equal(saveMilkUse(s, { name: '   ' }, mk).length, 2, 'blank names ignored');
  const recs = [{ type: 'milkUse', reason: id }];
  s = { milkUseReasons: dropMilkUse(s, id, recs) };
  assert.ok(!milkUses(s).some((x) => x.id === id), 'hidden from the cards');
  assert.equal(milkUseName(s, id, t), 'Family', 'old entries keep their name');
  s = { milkUseReasons: dropMilkUse(s, 'Cheese', recs) };
  assert.equal(milkUses(s, { all: true }).filter((x) => !x.builtin).length, 1, 'unused one removed');
});
