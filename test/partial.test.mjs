import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { compute } from '../src/core/ledger.mjs';
import { trialBalance } from '../src/core/accounts.mjs';
import { PARTS, PART_KEYS, partOf, pickParts, partEnvelope, restoreParts, isPartFile, partCounts } from '../src/core/partial.mjs';
import { normalise } from '../src/core/backup.mjs';

const T = '2026-11-02';
const farm = () => sampleFarm('en', T);
const balances = (f) => { const s = compute(f, { to: '9999-12-31' }); return { cash: s.cashC, cust: s.cust, sup: s.sup, people: s.people, milk: s.milk.stockL, eggs: s.eggs.stock }; };
const tbZero = (f) => trialBalance(f, {}).rows.reduce((a, r) => a + r.balance, 0);

test('every entry type in the sample farm belongs to exactly one part', () => {
  for (const r of farm().records) {
    const owners = PART_KEYS.filter((k) => PARTS[k].rec(r));
    assert.equal(owners.length, 1, `${r.type} → ${owners}`);
    assert.equal(partOf(r), owners[0]);
  }
});

test('all parts together make the whole farm again', () => {
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, PART_KEYS)));
  assert.ok(isPartFile(env));
  const empty = { ...f, records: [], customers: [], suppliers: [], people: [], animals: [], workers: [], obligations: [], orders: [], documents: [] };
  const back = normalise(restoreParts(empty, env, { mode: 'add' }));
  assert.deepEqual(balances(back), balances(f));
  assert.equal(back.records.length, f.records.length);
});

test('a part file carries the rows its entries point at', () => {
  const f = farm();
  const p = pickParts(f, ['expenses']);
  for (const r of p.records) if (r.personId) assert.ok(p.people.some((x) => x.id === r.personId));
  const s = pickParts(f, ['sales']);
  assert.ok(s.customers.length > 0);
  assert.equal(s.suppliers.length, 0);
  assert.equal(s.records.every((r) => r.type === 'sale' || r.type === 'payment'), true);
});

test('add: restoring lost sales brings them back and touches nothing else', () => {
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['sales'])));
  // On the device, the sales were lost, and a new expense was added meanwhile.
  const lost = { ...f, records: f.records.filter((r) => r.type !== 'sale' && r.type !== 'payment') };
  const extra = { id: 'exp-new', type: 'expense', day: T, category: 'fuel', amountC: 1234, paidC: 1234, source: 'cash', createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-02T10:00:00Z' };
  lost.records = [...lost.records, extra];
  const back = normalise(restoreParts(lost, env, { mode: 'add' }));
  const want = normalise({ ...f, records: [...f.records, extra] });
  assert.deepEqual(balances(back), balances(want));
  assert.equal(tbZero(back), 0);
  assert.ok(back.records.some((r) => r.id === 'exp-new'));
});

test('add keeps the newer copy; replace makes the part exactly the file', () => {
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['production'])));
  const milk = f.records.find((r) => r.type === 'milk');
  const edited = { ...milk, liters: milk.liters + 5, updatedAt: '2099-01-01T00:00:00Z' };
  const extraMilk = { ...milk, id: 'milk-extra', updatedAt: '2099-01-01T00:00:00Z' };
  const local = { ...f, records: [...f.records.map((r) => (r.id === milk.id ? edited : r)), extraMilk] };
  const add = restoreParts(local, env, { mode: 'add' });
  assert.equal(add.records.find((r) => r.id === milk.id).liters, edited.liters);
  assert.ok(add.records.some((r) => r.id === 'milk-extra'));
  const rep = restoreParts(local, env, { mode: 'replace' });
  assert.equal(rep.records.find((r) => r.id === milk.id).liters, milk.liters);
  assert.ok(!rep.records.some((r) => r.id === 'milk-extra'));
  // Money is untouched by a production restore.
  assert.equal(compute(rep).cashC, compute(local).cashC);
});

test('document numbers never go backwards; settings only change when chosen', () => {
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['sales'])));
  const local = { ...f, settings: { ...f.settings, farmName: 'Kept', seq: { ...f.settings.seq, inv: (f.settings.seq?.inv || 0) + 50 } } };
  const out = restoreParts(local, env);
  assert.equal(out.settings.farmName, 'Kept');
  assert.equal(out.settings.seq.inv, local.settings.seq.inv);
  const env2 = JSON.parse(JSON.stringify(partEnvelope(f, ['settings'])));
  assert.equal(restoreParts(local, env2).settings.farmName, f.settings.farmName);
  assert.equal(restoreParts(local, env2).settings.seq.inv, local.settings.seq.inv);
});

test('counts per part', () => {
  const c = partCounts(farm());
  assert.ok(c.sales.entries > 0 && c.production.entries > 0 && c.animals.rows > 0);
});

test('add brings back an entry deleted after the backup', () => {
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['sales'])));
  const pay = f.records.find((r) => r.type === 'payment');
  const local = { ...f, records: f.records.map((r) => (r.id === pay.id ? { ...r, deletedAt: '2099-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z' } : r)) };
  const back = normalise(restoreParts(local, env, { mode: 'add' }));
  assert.ok(!back.records.find((r) => r.id === pay.id).deletedAt);
  assert.deepEqual(balances(back), balances(f));
});

test('the preview counts only real changes', async () => {
  const { partDiff } = await import('../src/core/partial.mjs');
  const f = farm();
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['production'])));
  assert.deepEqual(partDiff(f, restoreParts(f, env, { mode: 'replace' })), {});
});
