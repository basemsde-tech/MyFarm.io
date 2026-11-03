import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, itemsTotalC, itemsQty, itemAmountC } from '../src/core/items.mjs';
import { validateRecord } from '../src/core/validate.mjs';
import { usesOrders } from '../src/core/orders.mjs';

test('bill items: line amounts in whole cents and the bill total is their sum', () => {
  const items = [{ desc: ' Hay ', qty: 50, unit: 'bag', priceC: 425 }, { desc: 'Salt', qty: 3, unit: 'bag', priceC: 710 }, { desc: '', qty: 0, priceC: 0 }];
  assert.equal(itemAmountC({ qty: 2.5, priceC: 333 }), 833);
  const clean = cleanItems(items);
  assert.equal(clean.length, 2);
  assert.equal(clean[0].desc, 'Hay');
  assert.equal(itemsTotalC(items), 21250 + 2130);
  assert.deepEqual(itemsQty(items), { qty: 53, unit: 'bag' });
  assert.equal(itemsQty([{ qty: 1, unit: 'kg', priceC: 1 }, { qty: 1, unit: 'bag', priceC: 1 }]), null);
});

test('a bill with items must add up and every item needs a quantity and price', () => {
  const base = { type: 'expense', day: '2026-11-01', category: 'feed', paidC: 0, source: 'cash' };
  const items = cleanItems([{ desc: 'Hay', qty: 10, unit: 'bag', priceC: 500 }]);
  assert.equal(validateRecord({ ...base, amountC: 5000, items }, { today: '2026-11-03' }).filter((i) => i.level === 'error' || i.severity === 'error' || i.code?.startsWith('items')).length, 0);
  assert.ok(validateRecord({ ...base, amountC: 4000, items }, { today: '2026-11-03' }).some((i) => i.code === 'items.total'));
  assert.ok(validateRecord({ ...base, amountC: 0, items: [{ desc: 'x', qty: 0, unit: 'bag', priceC: 0, amountC: 0 }] }, { today: '2026-11-03' }).some((i) => i.code === 'item.incomplete'));
});

test('purchase orders are off unless switched on', () => {
  assert.equal(usesOrders({ settings: {}, orders: [{ id: 'o1' }] }), false);
  assert.equal(usesOrders({ settings: { purchaseOrders: true } }), true);
});
