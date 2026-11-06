// Which playful moment fits what was just saved. Pure: compares the farm before and after a change.
// Returns null, or { kind, ... } for the celebration screen (src/ui/celebrate.jsx).
import { compute } from './ledger.mjs';

/** Kinds, in the order they win when one save does several things. */
export const CELEBRATIONS = ['clear', 'birth', 'animal', 'sale', 'payment', 'supplierPay', 'eggs', 'milk', 'backup'];

const liveNew = (before, after) => {
  const had = new Map((before.records || []).map((r) => [r.id, r]));
  // New entries (or entries that came back to life) that are live now.
  return (after.records || []).filter((r) => !r.deletedAt && !r.voided && !r.carried && (!had.has(r.id) || had.get(r.id).deletedAt));
};

// A customer payment: cash taken plus anything settled by offsets (expenses the customer paid).
const payC = (r) => (r.cashC || 0) + (r.offsets || []).reduce((x, o) => x + (o.amountC || 0), 0);

export function pickCelebration(before, after) {
  if (!before || !after || before === after) return null;
  const added = liveNew(before, after);
  const restored = added.filter((r) => (before.records || []).some((x) => x.id === r.id));
  if (restored.length && restored.length === added.length) return null; // undo / restore: no party
  const fresh = added.filter((r) => !restored.includes(r));
  const of = (type) => fresh.filter((r) => r.type === type);

  // A customer or supplier fully paid up by this payment.
  const pays = of('payment');
  const sups = of('supplierPay');
  if (pays.length || sups.length) {
    const a = compute(before, { to: '9999-12-31' });
    const b = compute(after, { to: '9999-12-31' });
    for (const p of pays) {
      const id = p.customerId;
      if (id && (a.cust[id]?.dueC || 0) > 0 && (b.cust[id]?.dueC || 0) <= 0) return { kind: 'clear', party: 'customer', id, amountC: payC(p) };
    }
    for (const p of sups) {
      const id = p.supplierId;
      if (id && (a.sup[id]?.dueC || 0) > 0 && (b.sup[id]?.dueC || 0) <= 0) return { kind: 'clear', party: 'supplier', id, amountC: p.amountC || 0 };
    }
  }
  const births = of('animalEvent').filter((r) => r.kind === 'birth');
  if (births.length) {
    const d = births[0].data || {};
    const n = d.birth === 'triplets' ? 3 : d.birth === 'twins' ? 2 : 1;
    return { kind: 'birth', animalId: births[0].animalId, n };
  }
  const had = new Set((before.animals || []).map((x) => x.id));
  const newAnimals = (after.animals || []).filter((x) => !had.has(x.id) && !x.deletedAt);
  if (newAnimals.length && newAnimals.length <= 3) return { kind: 'animal', animalId: newAnimals[0].id, n: newAnimals.length, species: newAnimals[0].species };
  const sales = of('sale');
  if (sales.length) return { kind: 'sale', amountC: sales.reduce((s, r) => s + (r.totalC || 0), 0), customerId: sales[0].customerId || null };
  if (pays.length) return { kind: 'payment', amountC: pays.reduce((s, r) => s + payC(r), 0), customerId: pays[0].customerId };
  if (sups.length) return { kind: 'supplierPay', amountC: sups.reduce((s, r) => s + (r.amountC || 0), 0), supplierId: sups[0].supplierId };
  const eggs = of('eggs');
  if (eggs.length) return { kind: 'eggs', n: eggs.reduce((s, r) => s + Math.max(0, (Number(r.count) || 0) - (Number(r.broken) || 0)), 0) };
  const milk = of('milk');
  if (milk.length) {
    const am = milk.filter((r) => r.session === 'am').reduce((s, r) => s + (Number(r.liters) || 0), 0);
    const pm = milk.filter((r) => r.session !== 'am').reduce((s, r) => s + (Number(r.liters) || 0), 0);
    return { kind: 'milk', am, pm };
  }
  return null;
}
