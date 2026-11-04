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

test('a period backup holds only that period, and replacing it leaves other months alone', async () => {
  const { partCounts } = await import('../src/core/partial.mjs');
  const f = farm();
  const range = { from: '2026-10-01', to: '2026-10-31' };
  const env = JSON.parse(JSON.stringify(partEnvelope(f, ['sales', 'production'], new Date(), null, range)));
  assert.deepEqual(env.range, range);
  assert.ok(env.farm.records.length > 0);
  assert.ok(env.farm.records.every((r) => r.day >= range.from && r.day <= range.to));
  assert.ok(env.farm.customers.length > 0, 'lists go in whole');
  assert.equal(partCounts(f, range).sales.entries, env.farm.records.filter((r) => r.type === 'sale' || r.type === 'payment').length);
  // On the device: October's sales were lost, and a November sale was added since.
  const nov = f.records.find((r) => r.type === 'sale' && r.day >= '2026-11-01');
  const sep = f.records.find((r) => r.type === 'sale' && r.day < '2026-10-01');
  const lost = { ...f, records: f.records.filter((r) => !((r.type === 'sale' || r.type === 'payment') && r.day >= range.from && r.day <= range.to)) };
  // replace: October comes back exactly; September and November stay.
  const rep = normalise(restoreParts(lost, env, { mode: 'replace' }));
  assert.deepEqual(balances(rep), balances(f));
  if (nov) assert.ok(rep.records.some((r) => r.id === nov.id));
  if (sep) assert.ok(rep.records.some((r) => r.id === sep.id));
  assert.equal(rep.customers.length, f.customers.length);
  // add does the same here.
  assert.deepEqual(balances(normalise(restoreParts(lost, env, { mode: 'add' }))), balances(f));
});

test('a period file that is all time behaves like a full part file', () => {
  const f = farm();
  const env = partEnvelope(f, ['sales'], new Date(), null, { from: '0000-00-00', to: '9999-12-31' });
  assert.equal(env.range, undefined);
});

test('backup file names are made safe', async () => {
  const { cleanFileName } = await import('../src/core/backup.mjs');
  assert.equal(cleanFileName('  My farm / Oct?.json '), 'My farm - Oct-.json');
  assert.equal(cleanFileName('نسخة أكتوبر'), 'نسخة أكتوبر.json');
  assert.equal(cleanFileName('..json'), 'mazraati-backup.json');
  assert.equal(cleanFileName('', 'x.json'), 'x.json');
  assert.equal(cleanFileName('Farm.JSON.json'), 'Farm.json');
  assert.ok(cleanFileName('a'.repeat(300)).length <= 125);
});

test('from a full backup: restore only the animals, production stays as it is now', async () => {
  const { asPartFile } = await import('../src/core/partial.mjs');
  const f = farm();
  const env = JSON.parse(JSON.stringify(asPartFile(f)));
  const a0 = f.animals[0];
  const milkNew = { ...f.records.find((r) => r.type === 'milk'), id: 'milk-today', day: '2026-11-02', liters: 7, updatedAt: '2099-01-01T00:00:00Z' };
  const local = { ...f, animals: f.animals.map((a) => (a.id === a0.id ? { ...a, name: 'WRONG', updatedAt: '2099-01-01T00:00:00Z' } : a)), records: [...f.records, milkNew] };
  const out = restoreParts(local, env, { mode: 'replace', parts: ['animals'] });
  assert.equal(out.animals.find((a) => a.id === a0.id).name, a0.name);
  assert.ok(out.records.some((r) => r.id === 'milk-today'), 'production untouched');
  assert.equal(compute(out).milk.stockL, compute(local).milk.stockL);
});

test('a period picked on restore narrows what comes back', async () => {
  const { asPartFile } = await import('../src/core/partial.mjs');
  const f = farm();
  const env = JSON.parse(JSON.stringify(asPartFile(f)));
  const lost = { ...f, records: f.records.filter((r) => r.type !== 'sale' && r.type !== 'payment') };
  const out = restoreParts(lost, env, { mode: 'add', parts: ['sales'], range: { from: '2026-10-01', to: '2026-10-31' } });
  const back = out.records.filter((r) => r.type === 'sale' || r.type === 'payment');
  assert.ok(back.length > 0);
  assert.ok(back.every((r) => r.day >= '2026-10-01' && r.day <= '2026-10-31'));
});
