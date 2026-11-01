import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '../src/core/ledger.mjs';
import { trialBalance, balanceSheet, profitAndLoss } from '../src/core/accounts.mjs';
import { closeBefore, moveRangeToTrash, emptyTrash, startFresh, entriesInRange, rangeSummary, yearsAgo } from '../src/core/danger.mjs';
import { autoPurge, addRecord, updateSettings, deleteRecords } from '../src/core/commands.mjs';
import { busyFarm } from './integration.test.mjs';

const owner = { id: 'o', name: 'Owner', role: 'owner' };
const worker = { id: 'w', name: 'Worker', role: 'worker' };
const key = (s) => ({ cash: s.cashC, ar: s.receivableC, sup: s.supplierDueC, bills: s.payablesC, eggs: s.eggs.stock, milk: s.milk.stockL, capital: s.capitalC, people: JSON.stringify(Object.fromEntries(Object.entries(s.people).map(([k, v]) => [k, v.owedC || 0]))) });

test('closing old years removes entries but keeps every balance', () => {
  const f = busyFarm();
  const before = compute(f);
  const plAfter = profitAndLoss(f, { from: '2026-10-08', to: '2026-10-31' });
  const g = closeBefore(f, '2026-10-08', owner);
  assert.ok(g.records.length < f.records.length, 'old entries gone');
  assert.ok(!g.records.some((r) => r.day < '2026-10-07' && ['sale', 'payment', 'supplierPay'].includes(r.type)), 'no old money entries left');
  assert.deepEqual(key(compute(g)), key(before), 'cash, owed, stock and capital unchanged');
  assert.ok(trialBalance(g).balanced, 'journal balances');
  assert.ok(balanceSheet(g).balanced, 'balance sheet balances');
  assert.equal(profitAndLoss(g, { from: '2026-10-08', to: '2026-10-31' }).profitC, plAfter.profitC, 'later profit unchanged');
  assert.equal(g.settings.lockedThrough, '2026-10-07', 'the closed period is locked');
});

test('a date range can be moved to Recently deleted and restored by retention', () => {
  const f = busyFarm();
  const opts = { from: '2026-10-04', to: '2026-10-06', groups: ['money'] };
  const sum = rangeSummary(entriesInRange(f, opts));
  assert.ok(sum.total >= 3 && sum.by.money === sum.total);
  const g = moveRangeToTrash(f, opts, owner, 'cleanup');
  assert.equal(g.records.filter((r) => r.deletedAt).length, sum.total);
  assert.throws(() => moveRangeToTrash(f, opts, worker), /forbidden/);
  // Retention: 7 days purges a week-old delete, 30 days keeps it.
  const old = deleteRecords(f, [f.records[0].id], owner, 'x', Date.parse('2026-10-01T00:00:00Z'));
  const at = Date.parse('2026-10-10T00:00:00Z');
  assert.equal(autoPurge(updateSettings(old, { trashDays: 7 }), at).records.length, f.records.length - 1);
  assert.equal(autoPurge(updateSettings(old, { trashDays: 30 }), at).records.length, f.records.length);
});

test('empty trash, start fresh, presets', () => {
  const f = deleteRecords(busyFarm(), [busyFarm().records[1].id], owner, 'x');
  assert.equal(emptyTrash(f, owner).records.filter((r) => r.deletedAt).length, 0);
  const s = startFresh(f, owner);
  assert.equal(s.records.length, 0);
  assert.ok(s.customers.length && !s.customers.some((c) => c.openingC), 'lists kept, openings reset');
  assert.equal(compute(s).cashC, 0);
  assert.equal(yearsAgo('2026-10-31', 1), '2025-10-31');
});
