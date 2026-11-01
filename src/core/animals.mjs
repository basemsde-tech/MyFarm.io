// Sold animals stay on record. A sale that names an animal marks it sold and keeps a
// snapshot of the sale on the animal; deleting or voiding that sale (with stock returned)
// puts the animal back. Everything else about a sold animal — weight, age, costs,
// production, gain — is worked out from its history, so the record never goes stale.

import { daysBetween } from './species.mjs';

const liveSale = (r) => r.type === 'sale' && !r.deletedAt && !r.voided && r.animalId;
const animalLineC = (sale) => {
  const lines = (sale.lines || []).filter((l) => l.product === 'animal');
  return lines.length ? lines.reduce((s, l) => s + (l.amountC || 0), 0) : sale.totalC || 0;
};

/** The live sale that sold this animal, newest first. */
export function saleOfAnimal(farm, animalId) {
  let best = null;
  for (const r of farm.records || []) {
    if (!liveSale(r) || r.animalId !== animalId) continue;
    if (!best || r.day > best.day || (r.day === best.day && String(r.createdAt) > String(best.createdAt))) best = r;
  }
  return best;
}

/** Last weight on or before a day: weigh-ins, then the weight on the card. */
export function weightOn(farm, a, day) {
  let w = null, wd = '';
  for (const r of farm.records || []) {
    if (r.deletedAt || r.type !== 'animalEvent' || r.animalId !== a.id || r.kind !== 'weight') continue;
    if (day && r.day > day) continue;
    if (r.day >= wd && +r.data?.weight > 0) { w = +r.data.weight; wd = r.day; }
  }
  return w ?? (a.weight > 0 ? a.weight : null);
}

/**
 * Keep animals in step with the sales that name them. `saleIds` limits the work to the
 * sales just touched; `extra` lists animals that may need re-checking (an edit that moved
 * a sale to another animal).
 */
export function syncAnimalSales(farm, saleIds, at = new Date().toISOString(), extra = []) {
  const touched = new Set(extra);
  for (const id of saleIds || []) {
    const r = (farm.records || []).find((x) => x.id === id);
    if (r?.type === 'sale' && r.animalId) touched.add(r.animalId);
  }
  if (!touched.size) return farm;
  let changed = false;
  const animals = (farm.animals || []).map((a) => {
    if (!touched.has(a.id)) return a;
    const sale = saleOfAnimal(farm, a.id);
    if (sale) {
      const sold = { saleId: sale.id, day: sale.day, customerId: sale.customerId || null, priceC: animalLineC(sale), no: sale.no || null, weightKg: a.sold?.saleId === sale.id && a.sold.weightKg ? a.sold.weightKg : weightOn(farm, a, sale.day), buyer: a.sold?.buyer || '', note: a.sold?.note || '' };
      const same = a.status === 'sold' && a.sold && ['saleId', 'day', 'customerId', 'priceC', 'no'].every((k) => a.sold[k] === sold[k]);
      if (same) return a;
      changed = true;
      return { ...a, status: 'sold', prevStatus: a.status === 'sold' ? a.prevStatus : a.status, sold, updatedAt: at };
    }
    // No live sale any more. A sale voided as a write-off means the animal still left the farm.
    const gone = (farm.records || []).some((r) => r.type === 'sale' && r.animalId === a.id && !r.deletedAt && r.voided?.mode === 'writeoff');
    // A sale removed when old years were closed keeps the animal sold (archived sale record).
    if (a.status === 'sold' && a.sold?.saleId && !gone && !a.sold.archived) {
      changed = true;
      const { sold, ...rest } = a;
      return { ...rest, status: a.prevStatus || 'healthy', updatedAt: at };
    }
    return a;
  });
  return changed ? { ...farm, animals } : farm;
}

/** Re-check every animal named on a sale (used when loading or restoring a farm). */
export function syncAllAnimalSales(farm) {
  const ids = (farm.records || []).filter((r) => r.type === 'sale' && r.animalId).map((r) => r.id);
  return ids.length ? syncAnimalSales(farm, ids, farm.updatedAt || new Date().toISOString()) : farm;
}

/** Everything worth keeping about a sold animal. Null when it is not sold. */
export function animalSaleInfo(farm, a) {
  if (!a || a.status !== 'sold') return null;
  const sale = saleOfAnimal(farm, a.id);
  const s = a.sold || {};
  const day = sale?.day || s.day || null;
  const priceC = sale ? animalLineC(sale) : s.priceC || 0;
  const recs = (farm.records || []).filter((r) => !r.deletedAt && (r.animalId === a.id || r.flockId === a.id));
  const treatC = recs.filter((r) => r.type === 'medicine').reduce((t, r) => t + (r.costC || 0), 0);
  const treatments = recs.filter((r) => r.type === 'medicine').length;
  const milkL = Math.round(recs.filter((r) => r.type === 'milk').reduce((t, r) => t + (+r.liters || 0), 0) * 10) / 10;
  const eggs = recs.filter((r) => r.type === 'eggs').reduce((t, r) => t + (r.count || 0) - (r.broken || 0), 0);
  const births = recs.filter((r) => r.type === 'animalEvent' && r.kind === 'birth').length;
  const purchaseC = a.source === 'bought' ? a.priceC || 0 : 0;
  const since = a.source === 'bought' ? a.boughtDay || a.startDay || null : a.dob || a.startDay || null;
  return {
    sale, day, priceC, no: sale?.no || s.no || null,
    customerId: sale ? sale.customerId || null : s.customerId || null,
    buyer: s.buyer || '', note: s.note || '',
    walkin: sale ? !sale.customerId : !s.customerId && !s.buyer,
    linked: !!sale, voided: !sale && !!s.saleId,
    weightKg: s.weightKg || weightOn(farm, a, day),
    ageDays: a.dob && day ? daysBetween(a.dob, day) : null,
    daysOnFarm: since && day ? daysBetween(since, day) : null,
    purchaseC, treatC, treatments, milkL, eggs, births, birds: a.birds || null,
    gainC: priceC - purchaseC - treatC,
  };
}

/** The sold-animals register, newest sale first. Archived animals are included. */
export function soldRegister(farm) {
  return (farm.animals || []).filter((a) => !a.deletedAt && a.status === 'sold')
    .map((a) => ({ a, info: animalSaleInfo(farm, a) }))
    .sort((x, y) => String(y.info.day || '').localeCompare(String(x.info.day || '')));
}
