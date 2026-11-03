// Selective backup: save only some parts of a farm, and restore them into a farm without touching the rest.
// A part file looks like a backup (kind 'farm-part') and lists its parts. Entries keep their ids, so
// restoring into the same farm lines up one to one. Masters an entry points at (a customer, a person,
// an animal) travel with it as references, so nothing in the file points at nothing.
import { FARM_VERSION } from './commands.mjs';

const isSupplierBill = (r) => r.type === 'expense' && !!r.supplierId;
const isOtherExpense = (r) => r.type === 'expense' && !r.supplierId;

/** The parts, in the order shown. `lists` are master lists; `rec` picks the entries. */
export const PARTS = {
  animals: { lists: ['animals'], rec: (r) => ['animalEvent', 'medicine'].includes(r.type) },
  sales: { lists: ['customers'], rec: (r) => r.type === 'sale' || r.type === 'payment' },
  suppliers: { lists: ['suppliers', 'orders'], rec: (r) => isSupplierBill(r) || r.type === 'supplierPay' },
  expenses: { lists: ['obligations'], rec: isOtherExpense },
  production: { lists: ['workers'], rec: (r) => ['milk', 'milkUse', 'eggs', 'eggUse', 'attendance'].includes(r.type) },
  people: { lists: ['people'], rec: (r) => r.type === 'capital' },
  cash: { lists: [], rec: (r) => r.type === 'opening' || r.type === 'transfer' },
  settings: { lists: ['profiles'], rec: () => false, settings: true },
};
export const PART_KEYS = Object.keys(PARTS);
/** Which part an entry belongs to (every entry type belongs to exactly one). */
export const partOf = (r) => PART_KEYS.find((k) => PARTS[k].rec(r)) || null;

// Owner lists for attached documents.
const DOC_PART = { animals: 'animals', customers: 'sales', suppliers: 'suppliers', orders: 'suppliers', people: 'people', workers: 'production' };

/** How much each part holds (live entries and list rows), for the picker. */
export function partCounts(farm) {
  const out = {};
  for (const k of PART_KEYS) {
    const p = PARTS[k];
    out[k] = {
      entries: (farm.records || []).filter((r) => !r.deletedAt && p.rec(r)).length,
      rows: p.lists.reduce((s, l) => s + (farm[l] || []).filter((x) => !x.deletedAt).length, 0),
    };
  }
  return out;
}

/** The ids an entry points at, by list. */
function refsOf(r) {
  const out = [];
  if (r.customerId) out.push(['customers', r.customerId]);
  if (r.supplierId) out.push(['suppliers', r.supplierId]);
  for (const k of ['personId', 'keptBy', 'takenBy']) if (r[k]) out.push(['people', r[k]]);
  for (const k of ['animalId', 'flockId']) if (r[k]) out.push(['animals', r[k]]);
  if (r.workerId) out.push(['workers', r.workerId]);
  for (const l of r.lines || []) if (l.animalId) out.push(['animals', l.animalId]);
  return out;
}

/** A farm holding only the chosen parts (plus the rows they point at). */
export function pickParts(farm, parts) {
  const want = parts.filter((k) => PARTS[k]);
  const lists = new Set(want.flatMap((k) => PARTS[k].lists));
  const records = (farm.records || []).filter((r) => want.some((k) => PARTS[k].rec(r)));
  const out = { records, partial: true };
  for (const l of ['customers', 'suppliers', 'people', 'animals', 'workers', 'profiles', 'obligations', 'orders']) out[l] = lists.has(l) ? [...(farm[l] || [])] : [];
  // References: rows an included entry points at travel along so the file stands on its own.
  const refs = {};
  for (const r of records) for (const [l, id] of refsOf(r)) {
    if (lists.has(l) || out[l].some((x) => x.id === id)) continue;
    const row = (farm[l] || []).find((x) => x.id === id);
    if (row) { out[l].push(row); (refs[l] = refs[l] || []).push(id); }
  }
  // Orders point at suppliers too.
  for (const o of out.orders) if (o.supplierId && !out.suppliers.some((s) => s.id === o.supplierId)) {
    const s = (farm.suppliers || []).find((x) => x.id === o.supplierId);
    if (s) { out.suppliers.push(s); (refs.suppliers = refs.suppliers || []).push(s.id); }
  }
  out.documents = (farm.documents || []).filter((d) => want.includes(DOC_PART[d.owner?.list]));
  out.refs = refs;
  if (want.includes('settings')) { out.settings = farm.settings; out.recovery = farm.recovery || null; }
  else out.settings = { farmName: farm.settings?.farmName || '', currency: farm.settings?.currency, seq: farm.settings?.seq };
  return out;
}

export function partEnvelope(farm, parts, now = new Date(), files = null) {
  const env = { app: 'mazraati', kind: 'farm-part', version: FARM_VERSION, exportedAt: now.toISOString(), parts: parts.filter((k) => PARTS[k]), farm: pickParts(farm, parts) };
  if (files && Object.keys(files).length) env.files = files;
  return env;
}

export const isPartFile = (data) => data?.kind === 'farm-part' && Array.isArray(data.parts) && !!data.farm;

const ts = (x) => x?.updatedAt || x?.createdAt || '';
const LISTS = ['customers', 'suppliers', 'people', 'animals', 'workers', 'profiles', 'obligations', 'orders', 'documents'];

/** Keeps document numbers moving forward past anything brought in. */
function maxSeq(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(Number(out[k]) || 0, Number(v) || 0);
  return out;
}

/**
 * Restore part of a farm into `local`.
 *  mode 'add'     — bring in what is missing (including entries deleted here since the backup);
 *                   where both have the same live entry, the newer one stays.
 *  mode 'replace' — the chosen parts become exactly what the file has (entries and lists of those
 *                   parts that are not in the file are removed); rows brought only as references
 *                   are added if missing, never replaced.
 * Nothing outside the file's parts changes. Purged ids (tombstones) stay purged.
 */
export function restoreParts(local, part, { mode = 'add', parts } = {}) {
  const chosen = (parts || part.parts || []).filter((k) => PARTS[k]);
  const pf = part.farm || part;
  const dead = new Set((local.tombstones || []).map((t) => t.id));
  const refs = pf.refs || {};
  const inChosen = (r) => chosen.some((k) => PARTS[k].rec(r));
  const ownLists = new Set(chosen.flatMap((k) => PARTS[k].lists));
  const docOwned = (d) => chosen.includes(DOC_PART[d.owner?.list]);
  const next = { ...local };
  const merge = (cur, inc, replaceAll, keepOf) => {
    const map = new Map();
    for (const x of cur) if (!replaceAll || keepOf(x)) map.set(x.id, x);
    for (const y of inc) {
      if (dead.has(y.id)) continue;
      const x = map.get(y.id);
      // Something deleted here but kept in the file counts as missing: restoring brings it back.
      if (!x || replaceAll || ts(y) > ts(x) || (x.deletedAt && !y.deletedAt)) map.set(y.id, y);
    }
    return [...map.values()];
  };
  const incRecords = (pf.records || []).filter(inChosen);
  next.records = merge(local.records || [], incRecords, mode === 'replace', (r) => !inChosen(r));
  for (const l of LISTS) {
    const inc = pf[l] || [];
    if (l === 'documents') { next.documents = merge(local.documents || [], inc.filter(docOwned), mode === 'replace', (d) => !docOwned(d)); continue; }
    if (ownLists.has(l)) next[l] = merge(local[l] || [], inc, mode === 'replace', () => false);
    else {
      // Only references: add the ones this farm does not have.
      const have = new Set((local[l] || []).map((x) => x.id));
      const add = inc.filter((x) => (refs[l] || []).includes(x.id) && !have.has(x.id) && !dead.has(x.id));
      if (add.length) next[l] = [...(local[l] || []), ...add];
    }
  }
  const seq = maxSeq(local.settings?.seq, pf.settings?.seq);
  next.settings = chosen.includes('settings') && pf.settings ? { ...pf.settings, seq } : { ...local.settings, seq };
  if (chosen.includes('settings') && pf.recovery) next.recovery = pf.recovery;
  next.rev = (local.rev || 0) + 1;
  return next;
}

/** What a part restore would change, for the confirmation screen. */
export function partDiff(local, next) {
  const out = {};
  for (const l of ['records', ...LISTS]) {
    const a = new Map((local[l] || []).map((x) => [x.id, x]));
    const b = new Map((next[l] || []).map((x) => [x.id, x]));
    let added = 0, changed = 0, removed = 0;
    for (const [id, y] of b) { const x = a.get(id); if (!x) added++; else if (x !== y && JSON.stringify(x) !== JSON.stringify(y)) changed++; }
    for (const id of a.keys()) if (!b.has(id)) removed++;
    if (added || changed || removed) out[l] = { added, changed, removed };
  }
  return out;
}
