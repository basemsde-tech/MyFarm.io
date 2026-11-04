import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFarm } from '../src/core/sample.mjs';
import { compute } from '../src/core/ledger.mjs';
import { trialBalance, balanceSheet } from '../src/core/accounts.mjs';
import { setPersonCashBox, capitalAccountFor, entriesToMove } from '../src/core/people.mjs';
import { closeBefore } from '../src/core/danger.mjs';

const T = '2026-11-02';
const zero = (f) => trialBalance(f, {}).rows.reduce((a, r) => a + r.balance, 0);
const owner = (f) => f.profiles.find((p) => p.role === 'owner');

test('a funder outside the cash box: their money moves the outside balance, not the box', () => {
  const f = sampleFarm('en', T);
  const p = f.people[0];
  const before = compute(f);
  const caps = f.records.filter((r) => r.type === 'capital' && r.personId === p.id && !r.deletedAt);
  assert.ok(caps.length > 0);
  const net = caps.reduce((s, r) => s + (r.kind === 'inject' ? 1 : -1) * r.amountC, 0);
  assert.equal(entriesToMove(f, p.id, false).length, caps.length);
  const { farm: g, moved } = setPersonCashBox(f, p.id, false, { movePast: true }, owner(f));
  assert.equal(moved, caps.length);
  const after = compute(g);
  assert.equal(after.cashC, before.cashC - net, 'cash box no longer has their money');
  assert.equal(after.outsideC, net, 'outside balance holds it');
  assert.equal(after.people[p.id].owedC, before.people[p.id].owedC, 'what the farm owes them is unchanged');
  assert.equal(after.capitalC, before.capitalC);
  assert.equal(zero(g), 0, 'books balance');
  assert.equal(balanceSheet(g).assets.outside, net);
  assert.equal(after.flows.filter((x) => x.account === 'cash' && caps.some((c) => c.id === x.id)).length, 0, 'not in the cash book');
  assert.equal(capitalAccountFor(g, p.id), 'outside');
  assert.ok(g.records.find((r) => r.id === caps[0].id).history.at(-1).reason === 'cashBox:out');
  // And back again.
  const { farm: h } = setPersonCashBox(g, p.id, true, { movePast: true }, owner(f));
  assert.equal(compute(h).cashC, before.cashC);
  assert.equal(compute(h).outsideC, 0);
});

test('switching without moving past entries changes only new entries', () => {
  const f = sampleFarm('en', T);
  const p = f.people[0];
  const { farm: g, moved } = setPersonCashBox(f, p.id, false, {}, owner(f));
  assert.equal(moved, 0);
  assert.equal(compute(g).cashC, compute(f).cashC);
  assert.equal(capitalAccountFor(g, p.id), 'outside');
});

test('locked months are not moved', () => {
  const f = sampleFarm('en', T);
  const p = f.people[0];
  const caps = f.records.filter((r) => r.type === 'capital' && r.personId === p.id && !r.deletedAt).sort((a, b) => a.day.localeCompare(b.day));
  const locked = { ...f, settings: { ...f.settings, lockedThrough: caps[0].day } };
  const { moved, skipped } = setPersonCashBox(locked, p.id, false, { movePast: true }, owner(f));
  assert.ok(skipped >= 1);
  assert.equal(moved + skipped, caps.length);
});

test('closing old periods carries the outside balance', () => {
  const f = sampleFarm('en', T);
  const p = f.people[0];
  const { farm: g } = setPersonCashBox(f, p.id, false, { movePast: true }, owner(f));
  const closed = closeBefore(g, '2026-11-01', owner(f), { groups: ['money', 'production'] });
  const a = compute(g), b = compute(closed);
  assert.equal(b.cashC, a.cashC);
  assert.equal(b.outsideC, a.outsideC);
  assert.equal(zero(closed), 0);
});
