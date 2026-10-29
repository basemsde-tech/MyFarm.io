import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { compute } from '../src/core/ledger.mjs';
import { statement, partyLines } from '../src/core/statement.mjs';

test('sample farm is valid: no oversell, statements match accounts', () => {
  const f = sampleFarm('en', '2026-10-29');
  const s = compute(f);
  assert.deepEqual(s.milk.issues, []);
  assert.deepEqual(s.eggs.issues, []);
  assert.ok(s.milk.stockL >= 0 && s.milk.stockL < 200, `stock ${s.milk.stockL}`);
  for (const c of f.customers) {
    const st = statement(partyLines(f, 'customer', c.id));
    assert.equal(st.closingC, (s.cust[c.id]?.dueC || 0) - (s.cust[c.id]?.creditBalC || 0), c.name);
  }
  for (const p of f.suppliers) {
    const st = statement(partyLines(f, 'supplier', p.id));
    assert.equal(st.closingC, (s.sup[p.id]?.dueC || 0) - (s.sup[p.id]?.creditBalC || 0), p.name);
  }
  for (const p of f.people) assert.equal(statement(partyLines(f, 'person', p.id)).closingC, s.people[p.id]?.owedC || 0, p.name);
  console.log('cash', s.cashC / 100, 'bank', s.bankC / 100, 'stock', s.milk.stockL, 'recv', s.receivableC / 100, 'records', f.records.length);
});
