// Managers and funders: whether their money goes through the farm's cash box.
// A person outside the cash box keeps the money they put in or take out in their own pocket or bank:
// those entries move an "outside the cash box" balance instead of the box (the books still balance,
// and their own account still shows what the farm owes them).
import { live } from './ledger.mjs';

export const inCashBox = (person) => person?.cashBox !== false;

/** Where a new put-in / take-out entry for this person posts. */
export function capitalAccountFor(farm, personId) {
  const p = (farm.people || []).find((x) => x.id === personId);
  return inCashBox(p) ? 'cash' : 'outside';
}

/** The person's put-in / take-out entries that sit on the other side of the switch. */
export function entriesToMove(farm, personId, on) {
  const want = on ? 'cash' : 'outside';
  return (farm.records || []).filter((r) => live(r) && r.type === 'capital' && r.personId === personId && (r.account === 'outside' ? 'outside' : 'cash') !== want);
}

/**
 * Switch a person in or out of the cash box. With `movePast`, their earlier put-in / take-out
 * entries move too (with an edit-history line), except those in a locked period.
 * Returns { farm, moved, skipped }.
 */
export function setPersonCashBox(farm, personId, on, { movePast = false } = {}, actor = null, now = new Date()) {
  const at = new Date(now).toISOString();
  const lock = farm.settings?.lockedThrough || '';
  const want = on ? 'cash' : 'outside';
  const people = (farm.people || []).map((p) => (p.id === personId ? { ...p, cashBox: on, updatedAt: at, updatedBy: actor?.id || null } : p));
  let moved = 0, skipped = 0;
  const records = !movePast ? farm.records : (farm.records || []).map((r) => {
    if (!(live(r) && r.type === 'capital' && r.personId === personId)) return r;
    const cur = r.account === 'outside' ? 'outside' : 'cash';
    if (cur === want) return r;
    if (lock && r.day <= lock) { skipped += 1; return r; }
    moved += 1;
    return { ...r, account: want, updatedAt: at, updatedBy: actor?.id || null, history: [...(r.history || []), { at, by: actor?.id || null, byName: actor?.name || '—', reason: on ? 'cashBox:in' : 'cashBox:out', fields: ['account'], before: { account: r.account || 'cash' } }] };
  });
  return { farm: { ...farm, people, records, rev: (farm.rev || 0) + 1 }, moved, skipped };
}
