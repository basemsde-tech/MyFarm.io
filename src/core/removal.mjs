// Smart removal: what a delete touches, whether produce goes back to stock,
// and restorable batches for customers, suppliers, people, animals, workers and obligations.
import { deleteRecords, restoreRecords, addRecord, newId, upsert, CommandError, isMoney } from './commands.mjs';
import { saleMilkL, saleEggs } from './milk.mjs';
import { can } from './catalog.mjs';

export const MASTER_LISTS = ['customers', 'suppliers', 'people', 'animals', 'workers', 'obligations'];
const live = (r) => !r.deletedAt;

/** Live records that point at one master row. */
export function linkedRecords(farm, list, id) {
  const hit = {
    customers: (r) => r.customerId === id,
    suppliers: (r) => r.supplierId === id,
    people: (r) => r.personId === id || r.keptBy === id || r.takenBy === id,
    animals: (r) => r.animalId === id || r.flockId === id,
    workers: (r) => r.workerId === id,
    obligations: (r) => r.obligationId === id,
  }[list];
  return hit ? farm.records.filter((r) => live(r) && hit(r)) : [];
}

/** Herd and production rows of an animal (never money). */
export function herdRecords(farm, id) {
  return linkedRecords(farm, 'animals', id).filter((r) => !isMoney(r));
}

/** Milk and eggs these records took out of stock (sales and their write-offs). */
export function produceOf(records) {
  let milkL = 0, eggs = 0;
  for (const r of records) {
    if (r.type !== 'sale' || !live(r) || r.voided?.mode === 'restore') continue;
    milkL += saleMilkL(r);
    eggs += saleEggs(r);
  }
  return { milkL: Math.round(milkL * 1000) / 1000, eggs };
}

/**
 * Delete records. stock: 'return' puts sold milk and eggs back in stock (the default);
 * 'keep' leaves them out by posting a write-off for each deleted sale, which a restore removes again.
 */
export function removeRecords(farm, ids, actor, reason = '', { stock = 'return', now, label } = {}) {
  let next = deleteRecords(farm, ids, actor, reason, now);
  if (stock !== 'keep') return next;
  for (const r of farm.records.filter((x) => ids.includes(x.id) && x.type === 'sale' && live(x) && x.voided?.mode !== 'restore')) {
    const l = saleMilkL(r);
    const n = saleEggs(r);
    const note = label || reason || '';
    if (l > 0) next = addRecord(next, { type: 'milkUse', day: r.day, liters: l, reason: 'waste', note, writeOffFor: r.id }, null, now);
    if (n > 0) next = addRecord(next, { type: 'eggUse', day: r.day, count: n, reason: 'waste', note, writeOffFor: r.id }, null, now);
  }
  return next;
}

/** Archive or bring back a master row. History stays. */
export function setArchived(farm, list, id, archived, actor) {
  return upsert(farm, list, { id, archived: !!archived }, actor);
}

/**
 * Delete a master row. mode 'only' removes just the row (refused for parties with entries,
 * whose balances would be hidden); 'withRecords' also moves the linked entries to the trash.
 * For animals 'withRecords' covers herd and production rows only, never money.
 */
export function deleteMaster(farm, list, id, actor, { mode = 'only', reason = '', now } = {}) {
  if (!MASTER_LISTS.includes(list)) throw new CommandError('badList');
  const row = (farm[list] || []).find((x) => x.id === id);
  if (!row) throw new CommandError('notFound');
  if (list === 'animals' && row.status === 'sold') throw new CommandError('soldAnimalKept');
  const linked = list === 'animals' ? herdRecords(farm, id) : linkedRecords(farm, list, id);
  const moneyLinked = linkedRecords(farm, list, id).filter(isMoney);
  if (mode === 'only' && linked.length && ['customers', 'suppliers', 'people'].includes(list)) throw new CommandError('hasRecords', { n: linked.length });
  if (moneyLinked.length && mode === 'withRecords' && list !== 'animals' && !can(actor?.role, 'money.delete')) throw new CommandError('forbidden');
  const at = (now ? new Date(now) : new Date()).toISOString();
  const batch = newId('del');
  let next = farm;
  if (mode === 'withRecords' && linked.length) {
    next = deleteRecords(next, linked.map((r) => r.id), actor, reason, now);
    next = { ...next, records: next.records.map((r) => (linked.some((x) => x.id === r.id) ? { ...r, deleteBatch: batch } : r)) };
  }
  return { ...next, rev: (next.rev || 0) + 1, [list]: next[list].map((x) => (x.id === id ? { ...x, deletedAt: at, deletedBy: actor?.id || null, deletedByName: actor?.name || '—', deleteReason: reason, deleteBatch: batch, updatedAt: at } : x)) };
}

/** Bring back a deleted master row and everything deleted with it. */
export function restoreMaster(farm, list, id, actor, now) {
  const row = (farm[list] || []).find((x) => x.id === id);
  if (!row?.deletedAt) return farm;
  const at = (now ? new Date(now) : new Date()).toISOString();
  const ids = farm.records.filter((r) => r.deleteBatch && r.deleteBatch === row.deleteBatch).map((r) => r.id);
  let next = ids.length ? restoreRecords(farm, ids, actor, now) : farm;
  const { deletedAt, deletedBy, deletedByName, deleteReason, deleteBatch, ...rest } = row;
  return { ...next, rev: (next.rev || 0) + 1, [list]: next[list].map((x) => (x.id === id ? { ...rest, updatedAt: at } : x)) };
}

/** Remove deleted master rows from what screens show. */
export function visibleFarm(farm) {
  let changed = false;
  const out = { ...farm };
  for (const k of MASTER_LISTS) {
    const arr = farm[k] || [];
    if (arr.some((x) => x.deletedAt)) { out[k] = arr.filter((x) => !x.deletedAt); changed = true; }
  }
  return changed ? out : farm;
}
