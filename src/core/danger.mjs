// Danger zone: bulk removal done safely.
//  · moveRangeToTrash — entries in a date range go to Recently deleted (restorable for the retention period).
//  · closeBefore — removes everything before a date for good while keeping every balance: what was owed,
//    cash in the box, eggs and milk in stock are carried forward as opening balances on the cutoff day.
//  · emptyTrash / startFresh / trash retention.
import { compute, live } from './ledger.mjs';
import { deleteRecords, newId, CommandError } from './commands.mjs';
import { can } from './catalog.mjs';

export const GROUPS = {
  money: ['sale', 'payment', 'expense', 'supplierPay', 'capital', 'medicine', 'opening'],
  production: ['milk', 'milkUse', 'eggs', 'eggUse', 'attendance'],
  herd: ['animalEvent'],
};
export const TRASH_CHOICES = [7, 30, 90, 180, 365];
export const trashDaysOf = (farm) => (TRASH_CHOICES.includes(farm?.settings?.trashDays) ? farm.settings.trashDays : 30);

const groupOfType = (type) => Object.keys(GROUPS).find((g) => GROUPS[g].includes(type)) || 'other';
const dayBefore = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export const yearsAgo = (today, n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() - n); return x.toISOString().slice(0, 10); };
const need = (actor) => { if (!can(actor?.role, 'purge')) throw new CommandError('forbidden', { need: 'purge' }); };

/** Live entries between two days (inclusive) in the chosen groups. */
export function entriesInRange(farm, { from = '0000-00-00', to, groups = ['money', 'production', 'herd'] }) {
  return (farm.records || []).filter((r) => live(r) && r.day >= from && r.day <= to && groups.includes(groupOfType(r.type)));
}

/** Counts per group and the money involved, for the confirmation screen. */
export function rangeSummary(records) {
  const by = { money: 0, production: 0, herd: 0, other: 0 };
  let first = '', last = '';
  for (const r of records) {
    by[groupOfType(r.type)] += 1;
    if (!first || r.day < first) first = r.day;
    if (!last || r.day > last) last = r.day;
  }
  return { total: records.length, by, first, last };
}

/** Restorable: everything in the range goes to Recently deleted, sold milk and eggs back to stock. */
export function moveRangeToTrash(farm, opts, actor, reason) {
  need(actor);
  const ids = entriesInRange(farm, opts).map((r) => r.id);
  if (!ids.length) return farm;
  return deleteRecords(farm, ids, actor, reason || 'date range');
}

/**
 * Remove every entry dated before `cutoff` (in the chosen groups) for good, carrying balances forward.
 * Money is all-or-nothing: closing the books needs every money entry before the cutoff gone together.
 */
export function closeBefore(farm, cutoff, actor, { groups = ['money', 'production'], now } = {}) {
  need(actor);
  const at = (now ? new Date(now) : new Date()).toISOString();
  const end = dayBefore(cutoff);
  const snap = compute(farm, { to: end, now });
  // Unpaid bills with no supplier are not part of any balance: keep them (trimmed to what is still open).
  // (A bill partly paid by a manager or funder still has its unpaid rest open, so it is kept too.)
  const openBill = (r) => r.type === 'expense' && !r.supplierId && r.source !== 'customer' && (r.paidC || 0) < (r.amountC || 0);
  const all = entriesInRange(farm, { to: end, groups });
  const kept = groups.includes('money') ? all.filter(openBill) : [];
  const gone = all.filter((r) => !kept.includes(r));
  if (!gone.length) return farm;
  const goneIds = new Set(gone.map((r) => r.id));
  let next = { ...farm };
  const stamp = (rec) => ({ ...rec, id: newId(rec.type.slice(0, 3)), createdAt: at, createdBy: actor?.id || null, createdByName: actor?.name || '—', updatedAt: at, updatedBy: actor?.id || null, history: [], carried: true });
  const added = [];
  if (groups.includes('money')) {
    // What each party owed on the cutoff becomes their opening balance.
    const net = (row, a, b) => (row?.[a] || 0) - (row?.[b] || 0);
    next.customers = (farm.customers || []).map((c) => ({ ...c, openingC: net(snap.cust[c.id], 'chargeC', 'creditC'), openingDay: end, updatedAt: at }));
    next.suppliers = (farm.suppliers || []).map((s) => ({ ...s, openingC: net(snap.sup[s.id], 'billC', 'paidC'), openingDay: end, updatedAt: at }));
    next.people = (farm.people || []).map((p) => ({ ...p, openingC: snap.people[p.id]?.owedC || 0, updatedAt: at }));
    // Cash in the box (and owner's capital) carried forward on the cutoff day.
    added.push(stamp({ type: 'opening', day: cutoff, cashC: snap.cashC, capitalC: snap.capitalC, note: `→ ${end}` }));
    // Animals sold in the closed period keep their sale record.
    next.animals = (farm.animals || []).map((a) => (a.status === 'sold' && a.sold?.saleId && goneIds.has(a.sold.saleId) ? { ...a, sold: { ...a.sold, archived: true } } : a));
  }
  if (groups.includes('production')) {
    if (snap.eggs.stock > 0) added.push(stamp({ type: 'eggs', day: end, count: snap.eggs.stock, broken: 0, flockId: null, note: 'opening' }));
    if (snap.milk.stockL > 0) added.push(stamp({ type: 'milk', day: end, session: 'day', species: 'cow', liters: snap.milk.stockL, note: 'opening' }));
  }
  const keptIds = new Set(kept.map((r) => r.id));
  const tomb = [...(farm.tombstones || []), ...gone.map((r) => ({ id: r.id, purgedAt: at }))];
  next.records = [...(farm.records || [])
    .filter((r) => !goneIds.has(r.id) && !(r.deletedAt && r.day <= end && groups.includes(groupOfType(r.type))))
    .map((r) => (keptIds.has(r.id) ? { ...r, amountC: r.amountC - Math.max(0, r.paidC || 0), paidC: 0, takenBy: null, carried: true, updatedAt: at } : r)), ...added];
  next.tombstones = tomb.slice(-5000);
  next.settings = { ...farm.settings, closedThrough: end, lockedThrough: farm.settings.lockedThrough && farm.settings.lockedThrough > end ? farm.settings.lockedThrough : end };
  next.rev = (farm.rev || 0) + 1;
  return next;
}

/** Empty Recently deleted now: deleted entries and deleted list rows go for good. */
export function emptyTrash(farm, actor, now) {
  need(actor);
  const at = (now ? new Date(now) : new Date()).toISOString();
  const gone = (farm.records || []).filter((r) => r.deletedAt);
  const out = { ...farm, records: (farm.records || []).filter((r) => !r.deletedAt), tombstones: [...(farm.tombstones || []), ...gone.map((r) => ({ id: r.id, purgedAt: at }))].slice(-5000), rev: (farm.rev || 0) + 1 };
  for (const k of ['customers', 'suppliers', 'people', 'animals', 'workers', 'obligations']) out[k] = (farm[k] || []).filter((x) => !x.deletedAt);
  return out;
}

/** Start fresh: every entry goes, the lists (customers, animals…) and settings stay. Opening balances reset. */
export function startFresh(farm, actor, now) {
  need(actor);
  const at = (now ? new Date(now) : new Date()).toISOString();
  const zero = (arr) => (arr || []).map((x) => (x.openingC ? { ...x, openingC: 0, updatedAt: at } : x));
  return {
    ...farm, records: [], orders: [], audit: farm.audit || [],
    customers: zero(farm.customers), suppliers: zero(farm.suppliers), people: zero(farm.people),
    animals: (farm.animals || []).map((a) => (a.status === 'sold' ? { ...a, sold: a.sold ? { ...a.sold, archived: true } : a.sold } : a)),
    tombstones: [...(farm.tombstones || []), ...(farm.records || []).map((r) => ({ id: r.id, purgedAt: at }))].slice(-5000),
    settings: { ...farm.settings, lockedThrough: null, closedThrough: null },
    rev: (farm.rev || 0) + 1,
  };
}
