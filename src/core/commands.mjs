// Every mutation goes through these pure commands. Each returns a new farm.
// Records keep a revision history; deletes are soft and restorable.

import { compute, diffSnapshots } from './ledger.mjs';
import { validateFarm, validateRecord } from './validate.mjs';
import { can } from './catalog.mjs';
import { syncAnimalSales } from './animals.mjs';

export const FARM_VERSION = 4;
export const TRASH_DAYS = 30;
const MONEY_TYPES = new Set(['sale', 'payment', 'expense', 'supplierPay', 'capital', 'medicine', 'transfer']);
export const isMoney = (r) => MONEY_TYPES.has(r.type) && !(r.type === 'medicine' && !r.costC);

let counter = 0;
export function newId(prefix = 'r') {
  counter = (counter + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

const nowIso = (now) => (now ? new Date(now) : new Date()).toISOString();

export function emptyFarm() {
  return {
    app: 'mazraati', version: FARM_VERSION, rev: 0, createdAt: nowIso(),
    settings: {
      farmName: '', farmPhone: '', farmAddress: '', farmEmail: '', logo: '', location: '',
      currency: 'USD', second: { code: 'LBP', rate: 89500 },
      milkPriceC: 100, eggPriceC: 15, wageC: 2000, milkMode: 'herd', milkUnit: 'L',
      termsDays: 30, lockedThrough: '',
      tax: { enabled: false, rate: 0, label: 'VAT', labelAr: 'ضريبة', number: '', registration: '', inclusive: false, show: true },
      doc: { prefix: 'INV-', rctPrefix: 'RCT-', poPrefix: 'PO-', thanks: '', footer: '', signatures: true, showParty: true, showRate: false },
      messaging: { countryCode: '961', remindAfterDays: 7, signature: '' },
      security: { requirePins: false, autoLockMin: 0, maxAttempts: 5 },
      backup: { everyDays: 1, lastAt: null, lastMethod: null, keep: 14 },
      categories: [], milkUseReasons: [], setupDone: false, updatedAt: nowIso(),
    },
    profiles: [], customers: [], suppliers: [], people: [], animals: [], workers: [], obligations: [],
    orders: [], documents: [], audit: [], records: [], recovery: null,
  };
}

function stampRecord(rec, actor, now) {
  const at = nowIso(now);
  return {
    ...rec,
    id: rec.id || newId(rec.type?.slice(0, 3) || 'r'),
    createdAt: rec.createdAt || at,
    createdBy: rec.createdBy || actor?.id || null,
    createdByName: rec.createdByName || actor?.name || '—',
    updatedAt: at,
    updatedBy: actor?.id || null,
    history: rec.history || [],
  };
}

function bumpRev(farm) {
  return { ...farm, rev: (farm.rev || 0) + 1, revAt: nowIso() };
}

export class CommandError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

/** Locked months: only someone allowed to override may change a record on or before the lock date. */
export function checkLock(farm, day, actor) {
  const lock = farm.settings?.lockedThrough;
  if (!lock || !day || day > lock) return { locked: false };
  if (can(actor?.role, 'lock.override')) return { locked: true, override: true };
  throw new CommandError('locked', { lock });
}

function checkPerm(actor, rec, op) {
  if (!actor) return;
  if (!isMoney(rec)) return;
  const need = op === 'create' ? (rec.type === 'sale' ? 'money.create.sale' : 'money.create') : op === 'edit' ? 'money.edit' : 'money.delete';
  if (!can(actor.role, need)) throw new CommandError('forbidden', { need });
}

/* Document numbers: invoices (sales) and receipts (customer payments) get a sequential number
   at creation that never changes and is never reused, even after a delete. */
export const NUMBERED = { sale: 'inv', payment: 'rct' };

/** Number every sale and payment that has none yet, oldest first, after the highest number in use. */
export function ensureNumbers(farm) {
  const seq = { inv: 0, rct: 0, ...(farm.settings?.seq || {}) };
  for (const r of farm.records || []) { const k = NUMBERED[r.type]; if (k && r.no > seq[k]) seq[k] = r.no; }
  const missing = (farm.records || []).filter((r) => NUMBERED[r.type] && !r.no);
  if (!missing.length && farm.settings?.seq) return farm;
  const order = [...missing].sort((a, b) => a.day.localeCompare(b.day) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const assigned = new Map();
  for (const r of order) { const k = NUMBERED[r.type]; seq[k] += 1; assigned.set(r.id, seq[k]); }
  return { ...farm, settings: { ...farm.settings, seq }, records: farm.records.map((r) => (assigned.has(r.id) ? { ...r, no: assigned.get(r.id) } : r)) };
}

/**
 * The farm keeps no bank account: every payment is cash through the cash box.
 * Older data is folded in — card/transfer methods and bank sources become cash,
 * and cash↔bank transfers (which no longer move anything) are dropped.
 */
export function foldBank(farm) {
  let changed = false;
  const records = [];
  for (const r of farm.records || []) {
    if (r.type === 'transfer') { changed = true; continue; }
    let n = r;
    if ((n.type === 'sale' || n.type === 'payment') && n.method && n.method !== 'cash') n = { ...n, method: 'cash' };
    if (n.source === 'bank') n = { ...n, source: 'cash' };
    if (n.account === 'bank') n = { ...n, account: 'cash' };
    if (n !== r) changed = true;
    records.push(n);
  }
  return changed ? { ...farm, records } : farm;
}

export function addRecord(farm, rec, actor, now) {
  checkPerm(actor, rec, 'create');
  checkLock(farm, rec.day, actor);
  let base = farm;
  let r = stampRecord(rec, actor, now);
  if ((base.records || []).some((x) => x.id === r.id)) throw new CommandError('duplicateId');
  const k = NUMBERED[r.type];
  if (k && !r.no) {
    base = ensureNumbers(base);
    const seq = { inv: 0, rct: 0, ...base.settings.seq };
    seq[k] += 1;
    r = { ...r, no: seq[k] };
    base = { ...base, settings: { ...base.settings, seq } };
  }
  return syncAnimalSales(bumpRev({ ...base, records: [...base.records, r] }), [r.id], r.createdAt);
}

const META = new Set(['no', 'id', 'type', 'createdAt', 'createdBy', 'createdByName', 'updatedAt', 'updatedBy', 'history', 'deletedAt', 'deletedBy', 'deletedByName', 'deleteReason']);

/** Fields whose change needs a written reason. */
export const MONEY_FIELDS = ['amountC', 'paidC', 'cashC', 'totalC', 'paidNowC', 'offsets', 'lines', 'costC', 'customerId', 'supplierId', 'personId', 'keptBy', 'source', 'liters', 'count', 'day'];

export function changedFields(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  for (const k of keys) {
    if (META.has(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push(k);
  }
  return out;
}

export function editRecord(farm, id, patch, actor, reason = '', now) {
  const old = farm.records.find((r) => r.id === id);
  if (!old) throw new CommandError('notFound');
  if (old.deletedAt) throw new CommandError('deleted');
  checkPerm(actor, old, 'edit');
  const lockA = checkLock(farm, old.day, actor);
  const next = { ...old, ...patch };
  const lockB = checkLock(farm, next.day, actor);
  const fields = changedFields(old, next);
  if (!fields.length) return farm;
  const needsReason = isMoney(old) && fields.some((f) => MONEY_FIELDS.includes(f));
  if (needsReason && String(reason).trim().length < 3) throw new CommandError('reasonRequired');
  const before = {};
  for (const f of fields) before[f] = old[f];
  const entry = { at: nowIso(now), by: actor?.id || null, byName: actor?.name || '—', reason: String(reason).trim(), fields, before };
  if (lockA.override || lockB.override) entry.afterClose = true;
  const rec = { ...next, id: old.id, type: old.type, history: [...(old.history || []), entry], updatedAt: entry.at, updatedBy: entry.by };
  if (entry.afterClose) rec.editedAfterClose = true;
  return syncAnimalSales(bumpRev({ ...farm, records: farm.records.map((r) => (r.id === id ? rec : r)) }), [id], entry.at, old.animalId ? [old.animalId] : []);
}

export function deleteRecords(farm, ids, actor, reason = '', now) {
  const set = new Set(ids);
  const at = nowIso(now);
  const records = farm.records.map((r) => {
    if (!set.has(r.id) || r.deletedAt) return r;
    checkPerm(actor, r, 'delete');
    checkLock(farm, r.day, actor);
    return { ...r, deletedAt: at, deletedBy: actor?.id || null, deletedByName: actor?.name || '—', deleteReason: reason, updatedAt: at };
  });
  return syncAnimalSales(bumpRev({ ...farm, records }), ids, at);
}

export function restoreRecords(farm, ids, actor, now) {
  const set = new Set(ids);
  const at = nowIso(now);
  const records = farm.records.map((r) => {
    if (!set.has(r.id) || !r.deletedAt) return r;
    const { deletedAt, deletedBy, deletedByName, deleteReason, deleteBatch, ...rest } = r;
    return { ...rest, updatedAt: at, history: [...(r.history || []), { at, by: actor?.id, byName: actor?.name, reason: 'restored', fields: [], before: {} }] };
  });
  // A write-off made when this sale was deleted must go, or the produce would leave stock twice.
  const cleaned = records.map((r) => (r.writeOffFor && set.has(r.writeOffFor) && !r.deletedAt ? { ...r, deletedAt: at, deletedBy: actor?.id || null, deletedByName: actor?.name || '—', deleteReason: 'replaced', updatedAt: at } : r));
  return syncAnimalSales(bumpRev({ ...farm, records: cleaned }), ids, at);
}

/** Permanent delete: owner only. Leaves a tombstone so sync cannot resurrect it. */
export function purgeRecords(farm, ids, actor, now) {
  if (!can(actor?.role, 'purge')) throw new CommandError('forbidden', { need: 'purge' });
  const set = new Set(ids);
  const at = nowIso(now);
  const tomb = [...(farm.tombstones || [])];
  const records = farm.records.filter((r) => {
    if (!set.has(r.id) || !r.deletedAt) return true;
    tomb.push({ id: r.id, purgedAt: at });
    return false;
  });
  return bumpRev({ ...farm, records, tombstones: tomb.slice(-5000) });
}

export function autoPurge(farm, now = Date.now()) {
  const cutoff = now - TRASH_DAYS * 86400000;
  const old = farm.records.filter((r) => r.deletedAt && new Date(r.deletedAt).getTime() < cutoff).map((r) => r.id);
  if (!old.length) return farm;
  const tomb = [...(farm.tombstones || []), ...old.map((id) => ({ id, purgedAt: new Date(now).toISOString() }))];
  return bumpRev({ ...farm, records: farm.records.filter((r) => !old.includes(r.id)), tombstones: tomb.slice(-5000) });
}

export function voidSale(farm, id, mode, reason, actor, now) {
  if (!['restore', 'writeoff'].includes(mode)) throw new CommandError('badMode');
  if (String(reason || '').trim().length < 3) throw new CommandError('reasonRequired');
  const old = farm.records.find((r) => r.id === id);
  if (!old || old.type !== 'sale') throw new CommandError('notFound');
  checkPerm(actor, old, 'delete');
  checkLock(farm, old.day, actor);
  const at = nowIso(now);
  const rec = { ...old, voided: { mode, reason: reason.trim(), at, by: actor?.id, byName: actor?.name }, updatedAt: at,
    history: [...(old.history || []), { at, by: actor?.id, byName: actor?.name, reason: `void:${mode} ${reason.trim()}`, fields: ['voided'], before: { voided: old.voided || null } }] };
  return syncAnimalSales(bumpRev({ ...farm, records: farm.records.map((r) => (r.id === id ? rec : r)) }), [id], at);
}

export function unvoidSale(farm, id, actor, now) {
  const old = farm.records.find((r) => r.id === id);
  if (!old?.voided) return farm;
  const at = nowIso(now);
  const { voided, ...rest } = old;
  const rec = { ...rest, updatedAt: at, history: [...(old.history || []), { at, by: actor?.id, byName: actor?.name, reason: 'void undone', fields: ['voided'], before: { voided } }] };
  return syncAnimalSales(bumpRev({ ...farm, records: farm.records.map((r) => (r.id === id ? rec : r)) }), [id], at);
}

/** Upsert into a master list (customers, suppliers, people, animals, workers, profiles, obligations). */
export function upsert(farm, list, item, actor, now) {
  const at = nowIso(now);
  const arr = farm[list] || [];
  const exists = item.id && arr.some((x) => x.id === item.id);
  const row = exists
    ? { ...arr.find((x) => x.id === item.id), ...item, updatedAt: at, updatedBy: actor?.id }
    : { ...item, id: item.id || newId(list.slice(0, 3)), createdAt: at, createdBy: actor?.id, createdByName: actor?.name, updatedAt: at };
  return bumpRev({ ...farm, [list]: exists ? arr.map((x) => (x.id === row.id ? row : x)) : [...arr, row] });
}

export function updateSettings(farm, patch) {
  return bumpRev({ ...farm, settings: { ...farm.settings, ...patch, updatedAt: nowIso() } });
}

/**
 * Dry-run a change. Returns { next, impact, issues, ok }.
 * op: (farm) => farm. Errors from the command are returned as issues.
 */
export function preview(farm, op, { names, today, now } = {}) {
  let next;
  try {
    next = op(farm);
  } catch (e) {
    return { ok: false, next: farm, impact: [], issues: [{ code: e.code || 'error', severity: 'error', detail: e.detail }] };
  }
  const a = compute(farm, { now });
  const b = compute(next, { now });
  const impact = diffSnapshots(a, b, names);
  // Animals that a sale marks sold, or a deleted sale puts back in the herd.
  const was = new Map((farm.animals || []).map((x) => [x.id, x.status]));
  for (const x of next.animals || []) {
    if (was.has(x.id) && was.get(x.id) !== x.status) impact.push({ key: 'animal', kind: 'status', before: was.get(x.id), after: x.status, ref: { id: x.id, name: x.name ? `${x.name} · ${x.tag}` : x.tag } });
  }
  const before = new Set(validateFarm(farm, a).map((i) => i.code + i.recordId));
  const issues = validateFarm(next, b).filter((i) => !before.has(i.code + i.recordId));
  return { ok: !issues.some((i) => i.severity === 'error'), next, impact, issues };
}

export { validateRecord };
