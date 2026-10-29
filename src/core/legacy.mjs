// Restore a Mazraati 2.x backup (one farm document with entries[] and archive[])
// into the 3.x record model, then reconcile every balance against the 2.x rules.
//
// 2.x stored one money action as several linked rows: a sale, its payment (saleId),
// customer-paid costs as expenses (paymentId / saleReimburseId), and supplier bills whose
// cash-out is a supplierPay (expenseId), sometimes only implied. Here each cluster becomes
// one 3.x record so cash, accounts and expenses can never drift apart.

import { emptyFarm, ensureNumbers } from './commands.mjs';
import { compute } from './ledger.mjs';
import { SPECIES, statusesFor } from './species.mjs';
import { PRODUCTS, EXPENSE_GROUPS, OFFSET_TYPES, MEDICINE_KINDS } from './catalog.mjs';

/* ── 2.x helpers, reproduced exactly ── */
const C = (n) => Math.round((+(n || 0)) * 100);
const norm = (s) => String(s || '').trim().toLowerCase();
export function dayOf(v) {
  if (!v && v !== 0) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(typeof v === 'number' || /^\d+$/.test(s) ? Number(v) : v);
  if (!Number.isFinite(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const isoOf = (v) => {
  const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
};
const tms = (v) => { const d = Date.parse(typeof v === 'number' ? new Date(v).toISOString() : v); return Number.isFinite(d) ? d : 0; };
const byTime = (a, b) => tms(a.at) - tms(b.at) || String(a.id).localeCompare(String(b.id));

const midOf = (e) => e?.managerId || e?.funderId || e?.takenBy || null;
const isOneTime = (e) => !!e && (e.oneTime === true || (e.channel === 'pos' && !e.customerId));
const payCashC = (e) => Math.max(0, C(e.amount_cash != null ? e.amount_cash : e.amount));
const isDeduction = (e) => !!e && (e.kind === 'DEDUCTION_REIMBURSEMENT' || e.origin === 'payment_reimbursement' || (e.type === 'saleReimburse' && C(e.amount) > 0));
const isCustomerPaid = (e) => !!e && e.type === 'expense' && (e.paidBy === 'customer' || !!e.saleReimburseId);
const isOwnerIn = (e) => e?.type === 'ownerFund' && C(e.amount) > 0;
const isOwnerOut = (e) => e?.type === 'ownerFundWithdraw' && C(e.amount) > 0;
const isOwnerFunded = (e) => e?.type === 'expense' && (e.fundedBy === 'owner' || e.origin === 'owner_fund');
const isMgrOop = (e) => e?.type === 'expense' && (e.fundedBy === 'manager' || e.origin === 'manager_oop') && !!midOf(e);
const isMgrSupplierPay = (e) => e?.type === 'supplierPay' && e.paidBy === 'manager' && !!midOf(e) && C(e.amount) > 0;
const isRetained = (e) => e?.type === 'payment' && e.retainedBy === 'manager' && !!midOf(e) && payCashC(e) > 0;
const isCashTake = (e) => e?.type === 'expense' && (e.origin === 'cash_take' || !!e.takenBy) && !!midOf(e) && !e.supplierId;
const paidPartC = (e) => {
  const bill = Math.max(0, C(e.amount));
  const st = e.payStatus || 'paid';
  if (st === 'unpaid') return 0;
  if (st === 'partial') return Math.min(bill, Math.max(0, C(e.paidAmount)));
  return bill;
};

export function isLegacyFarm(data) {
  const f = data?.kind === 'farm-backup' && data.farm ? data.farm : data;
  return !!f && Array.isArray(f.entries) && !!f.settings && !Array.isArray(f.records);
}

/** The 2.x load-time migration: archive merged in, funders→managers, old expense types, payment fields. */
export function normalizeOld(raw) {
  const f = { ...(raw?.kind === 'farm-backup' && raw.farm ? raw.farm : raw) };
  const seen = new Set();
  let entries = [];
  for (const e of [...(f.entries || []), ...(f.archive || [])]) {
    if (!e || typeof e !== 'object') continue;
    const id = e.id || `legacy-${entries.length}-${e.type}-${e.at}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ ...e, id, ...(e.cowId && !e.animalId ? { animalId: e.cowId } : {}) });
  }
  if (entries.some((e) => e.customerId === 'cust-walkin') && !(f.customers || []).some((c) => c.id === 'cust-walkin' || c.kind === 'walkin')) {
    f.customers = [...(f.customers || []), { id: 'cust-walkin', kind: 'walkin', name: 'Walk-in', product: 'milk', priceL: 0, defaultQty: 0 }];
  }
  const managers = (f.managers?.length ? f.managers : f.funders || []).filter(Boolean).map((m) => ({ ...m }));
  let gen = 0;
  entries = entries.map((e) => {
    let r = e;
    if (r.funderId && !r.managerId) r = { ...r, managerId: r.funderId };
    if (r.takenBy && !r.managerId) r = { ...r, managerId: r.takenBy };
    const label = String(r.contributorLabel || r.recipientLabel || '').trim();
    if (!r.managerId && label && (r.type === 'ownerFund' || r.type === 'ownerFundWithdraw' || r.origin === 'cash_take' || r.origin === 'manager_oop'
      || r.fundedBy === 'manager' || r.paidBy === 'manager' || r.retainedBy === 'manager')) {
      let hit = managers.find((m) => !m.archived && norm(m.name) === norm(label));
      if (!hit) { hit = { id: `mgr-import-${++gen}`, name: label, phone: '', note: '', at: r.at }; managers.push(hit); }
      r = { ...r, managerId: hit.id };
    }
    if (r.type === 'feed') r = { ...r, type: 'expense', category: 'feed', amount: r.amount ?? r.cost };
    else if (r.type === 'purchase') r = { ...r, type: 'expense', category: 'livestock', amount: r.amount ?? r.cost };
    if (r.type === 'expense') {
      const amount = C(r.amount ?? r.cost) / 100;
      const rawPaid = r.paidAmount === undefined
        ? (r.payStatus === 'unpaid' || r.payStatus === 'partial' ? 0 : C(amount))
        : Math.max(0, Math.min(C(amount), C(r.paidAmount)));
      const status = ['paid', 'partial', 'unpaid'].includes(r.payStatus) ? r.payStatus : rawPaid >= C(amount) ? 'paid' : rawPaid > 0 ? 'partial' : 'unpaid';
      r = { ...r, amount, payStatus: status, paidAmount: status === 'paid' ? amount : status === 'unpaid' ? 0 : rawPaid / 100, category: r.category || 'other' };
    }
    return r;
  });
  // Payments: fill the offset total from linked reimbursement expenses when missing.
  const offsetByPay = {};
  for (const e of entries) if (e.origin === 'payment_reimbursement' && e.paymentId) offsetByPay[e.paymentId] = (offsetByPay[e.paymentId] || 0) + C(e.amount);
  entries = entries.map((e) => {
    if (e.type !== 'payment') return e;
    const cash = payCashC(e);
    const off = e.amount_expense_offset != null ? C(e.amount_expense_offset) : offsetByPay[e.id] || 0;
    return { ...e, amount: cash / 100, amount_cash: cash / 100, amount_expense_offset: off / 100 };
  });
  return { f, entries, managers };
}

/** Supplier cash-out for older paid bills that never got a supplierPay row (2.x rule). */
function withImpliedSupplierPays(entries) {
  const linked = new Set(entries.filter((e) => e.type === 'supplierPay' && e.expenseId).map((e) => e.expenseId));
  const pool = {};
  for (const e of entries) if (e.type === 'supplierPay' && !e.expenseId && !e.implied && e.supplierId) pool[e.supplierId] = (pool[e.supplierId] || 0) + Math.max(0, C(e.amount));
  const implied = [];
  for (const e of entries) {
    if (e.type !== 'expense' || !e.supplierId || linked.has(e.id)) continue;
    let amt = paidPartC(e);
    if (!(amt > 0)) continue;
    const take = Math.min(amt, pool[e.supplierId] || 0);
    if (take > 0) { pool[e.supplierId] -= take; amt -= take; }
    if (!(amt > 0)) continue;
    implied.push({ type: 'supplierPay', id: `implied-${e.id}`, supplierId: e.supplierId, amount: amt / 100, expenseId: e.id, at: e.at, vendor: e.vendor || '', method: 'cash', note: e.note || '', implied: true, byId: e.byId, byName: e.byName, loggedAt: e.loggedAt });
  }
  return [...implied, ...entries];
}

/** Balances exactly as Mazraati 2.x showed them, in cents. */
export function oldBalances({ f, entries, managers }) {
  const src = withImpliedSupplierPays(entries);
  // Cash box (2.x had one drawer for every payment method).
  let cash = 0;
  for (const e of src) {
    if (e.type === 'payment') { if (!isRetained(e)) cash += payCashC(e); }
    else if (isOwnerIn(e)) cash += C(e.amount);
    else if (isOwnerOut(e)) cash -= C(e.amount);
    else if (e.type === 'supplierPay') { if (!isMgrSupplierPay(e)) cash -= C(e.amount); }
    else if (e.type === 'expense') {
      if (!(e.supplierId || isCustomerPaid(e) || isDeduction(e) || isMgrOop(e))) cash -= paidPartC(e);
    } else if (e.type === 'med') cash -= C(e.cost);
  }
  // Customers (buildLedger): gross − own reimbursements − discount − deductions − payments.
  const cust = {};
  const add = (id, k, v) => { if (!id) return; (cust[id] ||= { charge: 0, credit: 0 })[k] += v; };
  const sales = entries.filter((e) => e.type === 'sale');
  const saleIds = new Set(sales.map((s) => s.id));
  const reimbBySale = {};
  for (const r of entries) if (r.type === 'saleReimburse' && saleIds.has(r.saleId) && C(r.amount) > 0) reimbBySale[r.saleId] = (reimbBySale[r.saleId] || 0) + C(r.amount);
  for (const s of sales) {
    if (!s.customerId || isOneTime(s)) continue;
    const g = C(s.amount);
    const own = reimbBySale[s.id] || 0;
    const after = g - Math.min(g, own);
    const disc = Math.min(after, Math.max(0, C(s.discountAmount)));
    add(s.customerId, 'charge', g - disc);
    add(s.customerId, 'credit', own);
  }
  for (const e of entries) if (e.type === 'expense' && isDeduction(e) && C(e.amount || e.deductions) > 0 && e.customerId) add(e.customerId, 'credit', C(e.amount || e.deductions));
  for (const p of entries) if (p.type === 'payment' && p.customerId && !isOneTime(p)) add(p.customerId, 'credit', Math.max(0, C(p.amount)));
  // Suppliers (buildSupplierLedger): bills (plus opening) − payments (plus implied).
  const sup = {};
  for (const s of f.suppliers || []) if (C(s.openingBalance) > 0) (sup[s.id] ||= { bill: 0, paid: 0 }).bill += C(s.openingBalance);
  for (const e of src) {
    if (e.type === 'expense' && e.supplierId) (sup[e.supplierId] ||= { bill: 0, paid: 0 }).bill += C(e.amount);
    if (e.type === 'supplierPay' && e.supplierId) (sup[e.supplierId] ||= { bill: 0, paid: 0 }).paid += C(e.amount);
  }
  // Managers (managerLedger.classifyManagerMove, same order of precedence).
  const mgr = {};
  const mv = (id, d) => { mgr[id] = (mgr[id] || 0) + d; };
  for (const e of entries) {
    const mid = midOf(e);
    if (!mid) continue;
    if (isOwnerIn(e)) mv(mid, C(e.amount));
    else if (isOwnerOut(e)) mv(mid, -C(e.amount));
    else if (isMgrOop(e)) mv(mid, paidPartC(e));
    else if (isMgrSupplierPay(e)) mv(mid, C(e.amount));
    else if (isRetained(e)) mv(mid, -payCashC(e));
    else if (isCashTake(e)) mv(mid, -paidPartC(e));
  }
  // Owner capital (ownerFunds.buildOwnerFund).
  let capital = 0;
  for (const e of entries) {
    if (isOwnerIn(e)) capital += C(e.amount);
    else if (isOwnerOut(e)) capital -= C(e.amount);
    else if (isOwnerFunded(e) && !e.supplierId) capital -= paidPartC(e);
  }
  return { cash, cust, sup, mgr, capital };
}

/* ── mapping helpers ── */
const CAT_MAP = { service: 'servicing', license: 'licensing', vendorPay: 'vendor' };
const BUILTIN_CATS = new Set(Object.values(EXPENSE_GROUPS).flat());
const MED_MAP = { vitamin: 'vitamins', mineral: 'minerals', parasite: 'deworming', treatment: 'otherTreatment' };
const ROLE_MAP = { owner: 'owner', book: 'book', milker: 'milker', Milker: 'milker', worker: 'worker', health: 'health' };
const UNIT_MAP = { eggs: 'egg', egg: 'egg', L: 'L', l: 'L', kg: 'kg', head: 'head', unit: 'unit' };
const KG_PER_L = 1.03;
const q2 = (n) => Math.round((+n || 0) * 100) / 100;

function milkLitres(e) {
  const l = e.liters != null && e.liters !== '' ? +e.liters : NaN;
  const kg = e.kg != null && e.kg !== '' ? +e.kg : NaN;
  if (Number.isFinite(l) && l >= 0 && Number.isFinite(kg)) return q2(l);
  const raw = e.liters ?? e.qty ?? 0;
  if (Number.isFinite(kg)) return q2(raw);
  return e.unit === 'kg' ? q2(q2(raw) / KG_PER_L) : q2(raw);
}
function mapBreed(species, raw) {
  if (!raw) return '';
  const list = SPECIES[species]?.breeds || [];
  const key = norm(raw).replace(/[^a-z]/g, '');
  const hit = list.find((b) => norm(b).replace(/[^a-z]/g, '') === key || norm(b).replace(/[^a-z]/g, '').includes(key));
  if (hit) return hit;
  if (key === 'shami' || key === 'damascus') return species === 'goat' ? 'Shami / Damascus' : 'Damascus';
  return String(raw).replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Convert a 2.x farm. Returns { farm, report }.
 * report.checks lists every balance with the 2.x figure and the restored figure.
 */
export function importLegacy(raw, { lang = 'ar', exportedAt } = {}) {
  const old = normalizeOld(raw);
  const { f, entries, managers } = old;
  const s = f.settings || {};
  const farm = emptyFarm();
  const report = { mapped: 0, skipped: 0, types: {}, kept: {}, warnings: [], checks: [], counts: {} };
  const tally = (bucket, type) => { report[bucket][type] = (report[bucket][type] || 0) + 1; };

  /* Settings */
  const tax = s.tax || {};
  const docTpl = s.docTpl || {};
  Object.assign(farm.settings, {
    farmName: s.farmName || '', farmPhone: s.farmPhone || '', farmAddress: s.farmAddress || '', farmEmail: s.farmEmail || '', logo: s.logo || '',
    location: s.loc ? [s.loc.name, s.loc.lat, s.loc.lon].filter((x) => x != null).join(' ') : '',
    currency: 'USD', second: { code: 'LBP', rate: Number(s.rate) || 0 },
    milkPriceC: C(s.milkPrice), eggPriceC: C(s.eggPrice), wageC: C(s.wage),
    milkMode: s.milkMode === 'animal' || s.milkMode === 'perAnimal' ? 'animal' : 'herd', milkUnit: s.milkUnit === 'kg' ? 'kg' : 'L',
    tax: { enabled: !!tax.enabled, rate: Number(tax.ratePct) || 0, label: tax.label || 'VAT', labelAr: tax.labelAr || 'ضريبة', number: tax.taxNumber || '', registration: tax.companyReg || '', inclusive: !!tax.pricesIncludeTax, show: tax.showTaxOnDocs !== false },
    doc: { prefix: tax.invoicePrefix || 'INV-', thanks: docTpl.thanks || '', footer: docTpl.footerNote || '', signatures: docTpl.showSigns !== false, showParty: docTpl.showParty !== false, showRate: !!docTpl.showRate },
    categories: (s.categories || []).filter((c) => c && c.key).map((c) => ({ key: c.key, name: (lang === 'ar' ? c.ar || c.en : c.en || c.ar) || c.key, group: c.group || 'otherGrp', icon: c.icon || '•' })),
    milkUseReasons: (s.milkUseReasons || []).map(String).filter(Boolean),
    setupDone: true, importedFrom: { version: f.version || 3, at: new Date().toISOString() },
  });
  const customCats = new Set(farm.settings.categories.map((c) => c.key));
  const cat = (k) => { const m = CAT_MAP[k] || k || 'other'; return BUILTIN_CATS.has(m) || customCats.has(m) ? m : 'other'; };

  /* Profiles: 2.x passcodes are SHA-256 of "salt:pin", the same scheme 3.x uses, so they keep working. */
  farm.profiles = (f.profiles || []).filter((p) => p && p.id).map((p) => ({
    id: p.id, name: String(p.name || '—').trim(), role: ROLE_MAP[p.role] || 'worker', avatar: p.emoji || p.avatar || '🙂', color: p.color || '#CFE3DA',
    passHash: p.pin || null, salt: p.pin ? p.salt || '' : null, cloudUid: p.cloudUid, cloudEmail: p.cloudEmail,
  }));
  if (!farm.profiles.length) farm.profiles = [{ id: 'pro-import-owner', name: lang === 'ar' ? 'صاحب المزرعة' : 'Farm owner', role: 'owner', avatar: '👨‍🌾', color: '#CFE3DA', passHash: null }];

  /* Customers. The 2.x permanent walk-in row is kept only if it still carries a balance. */
  const ob = oldBalances(old);
  const walkinIds = new Set((f.customers || []).filter((c) => c.kind === 'walkin' || c.id === 'cust-walkin').map((c) => c.id));
  walkinIds.add('cust-walkin');
  const walkinBal = [...walkinIds].some((id) => ob.cust[id] && ob.cust[id].charge !== ob.cust[id].credit);
  const dropWalkin = (id) => walkinIds.has(id) && !walkinBal;
  let n = 0;
  farm.customers = (f.customers || []).filter((c) => c && c.id && !dropWalkin(c.id)).map((c) => ({
    id: c.id, accountNo: `C-${String(++n).padStart(4, '0')}`, name: walkinIds.has(c.id) ? (lang === 'ar' ? 'عميل نقدي (قديم)' : 'Walk-in (old)') : String(c.name || '—'),
    phone: c.phone || '', defaultProduct: PRODUCTS[c.product] ? c.product : 'milk', defaultPriceC: C(c.priceL) || undefined, defaultQty: +c.defaultQty || 0,
    archived: !!c.archived, note: c.note || '', createdAt: isoOf(c.at), updatedAt: isoOf(c.at),
  }));
  const custIds = new Set(farm.customers.map((c) => c.id));

  farm.suppliers = (f.suppliers || []).filter((x) => x && x.id).map((x) => ({
    id: x.id, name: String(x.name || '—'), phone: x.phone || '', note: x.note || '',
    tags: (x.tags || []).map((tg) => (tg === 'med' ? 'medicine' : ['feed', 'medicine', 'other'].includes(tg) ? tg : 'other')),
    openingC: C(x.openingBalance), openingDay: x.openingAt || x.at ? dayOf(x.openingAt || x.at) : '0000-00-00',
    archived: !!x.archived, createdAt: isoOf(x.at), updatedAt: isoOf(x.at),
  }));
  farm.people = managers.filter((m) => m && m.id).map((m) => ({ id: m.id, name: String(m.name || '—'), phone: m.phone || '', note: m.note || '', archived: !!m.archived, createdAt: isoOf(m.at), updatedAt: isoOf(m.at) }));

  /* Animals, with unique tags. */
  const tags = new Set();
  farm.animals = (f.animals || []).filter((a) => a && a.id).map((a) => {
    const species = SPECIES[a.species] ? a.species : 'cow';
    const flock = SPECIES[species].mode === 'flock';
    let tag = String((flock ? a.tag || a.name : a.tag || a.name) || a.id.slice(-4)).trim();
    while (tags.has(norm(tag))) tag = `${tag}-2`;
    tags.add(norm(tag));
    const statuses = statusesFor(species);
    const status = statuses.includes(a.status) ? a.status : (a.status === 'active' || !a.status ? (flock ? 'laying' : 'healthy') : (flock ? 'laying' : 'healthy'));
    const check = ['pregnant', 'dry', 'lactating'].includes(a.status) && a.served ? 'pregnant' : a.preg === 'open' ? 'open' : null;
    return {
      id: a.id, species, tag, name: flock ? (a.tag ? a.name || '' : '') : a.name || '', breed: mapBreed(species, a.breed), status,
      dob: a.dob || '', weight: +a.weight || 0, yieldL: +a.expected || 0, parity: +a.parity || 0, source: a.source === 'bought' ? 'bought' : 'born',
      priceC: C(a.price), birds: +a.birds || 0, coop: a.coop || '', photo: a.photo || '', medicine: a.med || a.medicine || '', notes: a.notes || a.note || '',
      sex: a.sex, motherId: a.motherId, startDay: a.dob || '',
      repro: a.served ? { serviceDay: dayOf(a.served), method: a.method === 'ai' || a.method === 'AI' ? 'ai' : 'natural', check } : null,
      createdAt: isoOf(a.at), updatedAt: isoOf(a.at),
    };
  });
  const animalById = new Map(farm.animals.map((a) => [a.id, a]));

  farm.workers = (f.workers || []).filter((w) => w && w.id).map((w) => ({
    id: w.id, name: String(w.name || '—'), pay: w.type === 'monthly' ? 'monthly' : 'daily', wageC: w.type === 'monthly' ? C(w.salary) : C(w.wage || s.wage), phone: w.phone || '',
    archived: !!w.archived, createdAt: isoOf(w.at), updatedAt: isoOf(w.at),
  }));
  farm.obligations = (f.obligations || []).filter((o) => o && o.id).map((o) => ({
    id: o.id, party: [o.title, o.party].filter(Boolean).join(' · ') || '—', kind: ['rent', 'bill', 'contract'].includes(o.type) ? o.type : 'bill',
    category: o.category ? cat(o.category) : o.type === 'rent' ? 'rent' : 'other', amountC: C(o.amount), nextDue: o.nextDue || '',
    freq: ['once', 'weekly', 'monthly', 'yearly'].includes(o.frequency) ? o.frequency : 'monthly', note: o.notes || '', archived: o.active === false,
    documents: o.documents || [], createdAt: isoOf(o.at), updatedAt: isoOf(o.at),
  }));

  /* Records */
  const src = withImpliedSupplierPays(entries);
  const base = (e, type) => ({
    id: e.id, type, day: dayOf(e.at) || dayOf(e.loggedAt) || '2000-01-01',
    createdAt: isoOf(e.loggedAt || e.at), createdBy: e.byId || null, createdByName: e.byName || '—', updatedAt: isoOf(e.loggedAt || e.at), history: [], legacyType: e.type,
  });
  const recs = [];
  const push = (r, srcType) => { recs.push(r); report.mapped++; tally('types', srcType); };
  const used = new Set();

  const custOf = (id) => (id && custIds.has(id) ? id : null);
  const method = (m) => (m === 'card' ? 'card' : m === 'transfer' || m === 'bank' || m === 'check' || m === 'cheque' ? 'transfer' : 'cash');

  const offsetsByPay = {};
  for (const e of src) if (e.type === 'expense' && e.origin === 'payment_reimbursement' && e.paymentId) (offsetsByPay[e.paymentId] ||= []).push(e);
  const paysBySale = {};
  for (const p of src) if (p.type === 'payment' && p.saleId) (paysBySale[p.saleId] ||= []).push(p);
  for (const list of Object.values(paysBySale)) list.sort(byTime);
  const reimbIds = new Set(src.filter((e) => e.type === 'saleReimburse').map((e) => e.id));

  // Sales, with the payment taken at the counter folded into the sale.
  for (const sl of src.filter((e) => e.type === 'sale').sort(byTime)) {
    const cid = isOneTime(sl) || dropWalkin(sl.customerId) ? null : custOf(sl.customerId);
    if (!cid && sl.customerId && !dropWalkin(sl.customerId) && !isOneTime(sl)) report.warnings.push({ code: 'saleNoCustomer', id: sl.id });
    const qty = +sl.qty > 0 ? +sl.qty : 1;
    const grossC = Math.max(0, C(sl.amount));
    const priceC = C(sl.price);
    const exact = priceC > 0 && Math.abs(Math.round(qty * priceC) - grossC) <= 1;
    const product = PRODUCTS[sl.product] ? sl.product : 'other';
    let discC = Math.min(grossC, Math.max(0, C(sl.discountAmount)));
    const r = {
      ...base(sl, 'sale'), customerId: cid,
      lines: [{ product, qty, unit: UNIT_MAP[sl.unit] || PRODUCTS[product].unit, priceC: exact ? priceC : Math.round(grossC / qty), direct: !exact, amountC: grossC }],
      discount: { kind: 'amount', valueC: discC, reason: sl.discountNote || '' }, discountC: discC, taxC: 0, totalC: grossC - discC,
      paidNowC: 0, tenderC: null, method: 'cash', note: sl.note || '', animalId: sl.animalId || null,
    };
    let room = r.totalC;
    let first = true;
    for (const p of paysBySale[sl.id] || []) {
      const off = C(p.amount_expense_offset);
      const cashC = payCashC(p);
      const fold = !isRetained(p) && off === 0 && cashC <= room && (cid ? dayOf(p.at) === r.day && (first || method(p.method) === r.method) : true);
      if (!fold) continue;
      if (first) r.method = method(p.method);
      r.paidNowC += cashC;
      room -= cashC;
      if (!cid) r.tenderC = (r.tenderC || 0) + Math.max(cashC, C(p.tenderAmount));
      used.add(p.id);
      first = false;
    }
    if (!cid && r.paidNowC < r.totalC) report.warnings.push({ code: 'walkinShort', id: sl.id, shortC: r.totalC - r.paidNowC });
    push(r, 'sale');
  }

  // Customer payments: cash plus customer-paid costs as offsets.
  for (const p of src.filter((e) => e.type === 'payment' && !used.has(e.id)).sort(byTime)) {
    let cid = dropWalkin(p.customerId) ? null : custOf(p.customerId);
    if (!cid && p.saleId) cid = recs.find((x) => x.id === p.saleId)?.customerId || null;
    const offsets = (offsetsByPay[p.id] || []).map((e) => {
      used.add(e.id);
      return { category: OFFSET_TYPES.includes(cat(e.category)) ? cat(e.category) : 'other', amountC: C(e.amount), desc: String(e.note || e.name || e.memo || e.category || '—') };
    });
    const offC = offsets.reduce((a, o) => a + o.amountC, 0);
    if (C(p.amount_expense_offset) > offC) offsets.push({ category: 'other', amountC: C(p.amount_expense_offset) - offC, desc: lang === 'ar' ? 'مصروف دفعه العميل' : 'Cost paid by customer' });
    if (!cid) {
      // A walk-in payment with no surviving sale: keep the cash as a walk-in sale so the drawer still matches.
      const amt = payCashC(p);
      if (amt > 0) {
        push({ ...base(p, 'sale'), customerId: null, lines: [{ product: 'other', qty: 1, unit: 'unit', priceC: amt, direct: true, amountC: amt }], discount: { kind: 'amount', valueC: 0 }, discountC: 0, taxC: 0, totalC: amt, paidNowC: amt, tenderC: Math.max(amt, C(p.tenderAmount)), method: method(p.method), note: p.note || '' }, 'payment');
        report.warnings.push({ code: 'paymentNoSale', id: p.id });
      }
      continue;
    }
    push({ ...base(p, 'payment'), customerId: cid, cashC: payCashC(p), method: method(p.method), keptBy: isRetained(p) ? midOf(p) : null, offsets, allowCredit: true, note: p.note || '' }, 'payment');
  }

  // 2.x sale reimbursements (customer paid a farm cost, credited against a sale).
  for (const e of src.filter((x) => x.type === 'saleReimburse' && C(x.amount) > 0).sort(byTime)) {
    const sale = recs.find((x) => x.id === e.saleId && x.type === 'sale');
    const desc = String(e.name || e.note || e.memo || (lang === 'ar' ? 'مصروف دفعه العميل' : 'Cost paid by customer'));
    if (sale && sale.customerId) {
      push({ ...base(e, 'payment'), customerId: sale.customerId, cashC: 0, method: 'cash', offsets: [{ category: OFFSET_TYPES.includes(cat(e.category)) ? cat(e.category) : 'other', amountC: C(e.amount), desc }], allowCredit: true, note: desc }, 'saleReimburse');
    } else if (sale) {
      const extra = Math.min(sale.totalC, C(e.amount));
      sale.discountC += extra; sale.discount.valueC += extra; sale.totalC -= extra;
      sale.discount.reason = [sale.discount.reason, desc].filter(Boolean).join(' · ');
      report.mapped++; tally('types', 'saleReimburse');
    } else { report.skipped++; tally('kept', 'saleReimburse'); }
  }

  // Expenses and supplier bills.
  for (const e of src.filter((x) => x.type === 'expense' && !used.has(x.id)).sort(byTime)) {
    if (e.saleReimburseId && reimbIds.has(e.saleReimburseId)) { used.add(e.id); continue; } // its offset carries the cost
    const amt = Math.max(0, C(e.amount));
    const common = {
      ...base(e, 'expense'), category: cat(e.category), amountC: amt, vendor: e.vendor || '', qty: +e.qty || null, unit: e.qty ? (e.unit === 'bags' ? 'bag' : e.unit || null) : null,
      unitPriceC: e.unitPrice ? C(e.unitPrice) : undefined, dueDay: e.payStatus !== 'paid' && e.dueDate ? dayOf(e.dueDate) : null, note: e.note || e.name || '',
      receipt: e.receipt || null, obligationId: e.obligationId || null, feedType: e.feedType,
    };
    if (common.unitPriceC === undefined) delete common.unitPriceC;
    if (e.supplierId) {
      push({ ...common, supplierId: e.supplierId, paidC: 0, source: 'cash', capital: isOwnerFunded(e) }, 'expense');
    } else if (isMgrOop(e)) {
      push({ ...common, paidC: paidPartC(e), source: 'person', personId: midOf(e) }, 'expense');
    } else if (isDeduction(e) && e.customerId && custOf(e.customerId)) {
      push({ ...base(e, 'payment'), customerId: e.customerId, cashC: 0, method: 'cash', offsets: [{ category: OFFSET_TYPES.includes(cat(e.category)) ? cat(e.category) : 'other', amountC: amt, desc: String(e.note || e.name || e.category) }], allowCredit: true }, 'expense');
    } else if (isCustomerPaid(e) || isDeduction(e)) {
      push({ ...common, paidC: amt, source: 'customer', customerId: custOf(e.customerId) }, 'expense');
    } else {
      push({ ...common, paidC: paidPartC(e), source: 'cash', capital: isOwnerFunded(e), takenBy: isCashTake(e) ? midOf(e) : null }, 'expense');
    }
  }

  // Supplier payments, including the implied ones 2.x derived for older paid bills.
  for (const p of src.filter((x) => x.type === 'supplierPay').sort(byTime)) {
    const mgrPaid = isMgrSupplierPay(p);
    push({
      ...base(p, 'supplierPay'), supplierId: p.supplierId, amountC: Math.max(0, C(p.amount)), billId: p.expenseId || null,
      source: mgrPaid ? 'person' : method(p.method) === 'cash' ? 'cash' : 'bank', personId: mgrPaid ? midOf(p) : null,
      note: p.note || '', vendor: p.vendor || '', ...(p.implied ? { legacyImplied: true } : {}),
    }, p.implied ? 'supplierPayImplied' : 'supplierPay');
  }

  for (const e of src.sort(byTime)) {
    const t = e.type;
    if (t === 'ownerFund' && C(e.amount) > 0) push({ ...base(e, 'capital'), kind: 'inject', purpose: 'capital', personId: midOf(e), amountC: C(e.amount), account: 'cash', note: [e.purpose, e.note].filter(Boolean).join(' · '), allocations: e.allocations }, t);
    else if (t === 'ownerFundWithdraw' && C(e.amount) > 0) push({ ...base(e, 'capital'), kind: 'withdraw', purpose: 'return', personId: midOf(e), amountC: C(e.amount), account: 'cash', note: [e.purpose, e.note].filter(Boolean).join(' · ') }, t);
    else if (t === 'med') push({ ...base(e, 'medicine'), animalId: e.animalId || null, kind: MEDICINE_KINDS.includes(MED_MAP[e.medType] || e.medType) ? MED_MAP[e.medType] || e.medType : 'otherTreatment', name: e.name || '', costC: Math.max(0, C(e.cost)), note: e.note || '' }, t);
    else if (t === 'milkBulk') push({ ...base(e, 'milk'), species: SPECIES[e.species]?.product === 'milk' ? e.species : 'cow', session: ['am', 'pm', 'day'].includes(e.session) ? e.session : 'day', liters: milkLitres(e) }, t);
    else if (t === 'milk') {
      const a = animalById.get(e.animalId);
      push({ ...base(e, 'milk'), species: a && SPECIES[a.species]?.product === 'milk' ? a.species : 'cow', session: ['am', 'pm', 'day'].includes(e.session) ? e.session : 'day', liters: milkLitres(e), animalId: e.animalId || null }, t);
    } else if (t === 'milkUse') {
      const reason = ['home', 'calves', 'waste'].includes(e.reason) ? e.reason : e.reason === 'void-writeoff' ? 'waste' : 'other';
      const label = e.reasonLabel || (String(e.reason || '').startsWith('custom:') ? e.reason.slice(7) : '');
      push({ ...base(e, 'milkUse'), liters: milkLitres(e), reason, note: [label, e.note].filter(Boolean).join(' · '), saleId: e.saleId }, t);
    } else if (t === 'eggs') push({ ...base(e, 'eggs'), flockId: e.animalId || e.flockId, count: Math.round(+e.count || 0), broken: Math.round(+e.broken || 0) }, t);
    else if (t === 'attend') push({ ...base(e, 'attendance'), workerId: e.workerId, present: !!e.present }, t);
    else if (t === 'weight') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'weight', data: { weight: +e.kg || +e.weight || 0 } }, t);
    else if (t === 'birth') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'birth', data: { birth: (+e.count || 1) >= 3 ? 'triplets' : (+e.count || 1) === 2 ? 'twins' : 'single', males: +e.males || 0, females: +e.females || 0, still: +e.dead || 0 } }, t);
    else if (t === 'loss') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'loss', data: { count: +e.count || 1, reason: ['disease', 'predator', 'heat'].includes(e.reason) ? e.reason : 'other' } }, t);
    else if (t === 'service') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'service', data: { method: e.method === 'ai' ? 'ai' : 'natural' } }, t);
    else if (t === 'pregCheck') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'check', data: { result: e.result === 'open' ? 'open' : 'pregnant' } }, t);
    else if (t === 'dryOff') push({ ...base(e, 'animalEvent'), animalId: e.animalId, kind: 'dry', data: {} }, t);
    else if (!['sale', 'payment', 'expense', 'supplierPay', 'saleReimburse', 'ownerFund', 'ownerFundWithdraw'].includes(t)) {
      // History-only rows (customerAdd, status, note, saleVoid, setting…) are kept untouched.
      (farm.legacyArchive ||= []).push(e);
      report.skipped++; tally('kept', t || 'unknown');
    }
  }
  // Medicine without a cost is a herd note: keep it as a non-money record (already pushed above).

  recs.sort((a, b) => a.day.localeCompare(b.day) || String(a.createdAt).localeCompare(String(b.createdAt)));
  farm.records = recs;
  farm.rev = 1;
  Object.assign(farm, ensureNumbers(farm));

  /* Reconcile every balance against 2.x */
  const snap = compute(farm);
  const names = { cust: new Map((f.customers || []).map((c) => [c.id, c.name])), sup: new Map((f.suppliers || []).map((x) => [x.id, x.name])), mgr: new Map(managers.map((m) => [m.id, m.name])) };
  const check = (key, name, oldC, newC, extra) => report.checks.push({ key, name, oldC, newC, ok: Math.abs(oldC - newC) <= 1, ...extra });
  check('cash', '', ob.cash, snap.cashC + snap.bankC, { cashC: snap.cashC, bankC: snap.bankC });
  check('capital', '', ob.capital, snap.capitalC);
  for (const [id, v] of Object.entries(ob.cust)) {
    if (dropWalkin(id) || isOneTime({ customerId: id })) continue;
    const nv = snap.cust[id] || {};
    check('customer', names.cust.get(id) || id, v.charge - v.credit, (nv.dueC || 0) - (nv.creditBalC || 0), { id });
  }
  for (const [id, v] of Object.entries(ob.sup)) {
    const nv = snap.sup[id] || {};
    check('supplier', names.sup.get(id) || id, v.bill - v.paid, (nv.dueC || 0) - (nv.creditBalC || 0), { id });
  }
  for (const [id, v] of Object.entries(ob.mgr)) check('person', names.mgr.get(id) || id, v, snap.people[id]?.owedC || 0, { id });
  if (snap.bankC) report.warnings.push({ code: 'bankSplit', bankC: snap.bankC, cashC: snap.cashC });
  if (farm.profiles.some((p) => p.passHash)) report.warnings.push({ code: 'pinsKept' });
  if (snap.milk.issues.length) report.warnings.push({ code: 'milkShort', n: snap.milk.issues.length });
  report.counts = {
    customers: farm.customers.length, suppliers: farm.suppliers.length, people: farm.people.length, animals: farm.animals.length,
    workers: farm.workers.length, obligations: farm.obligations.length, profiles: farm.profiles.length, records: recs.length,
    sales: recs.filter((r) => r.type === 'sale').length, payments: recs.filter((r) => r.type === 'payment').length,
    expenses: recs.filter((r) => r.type === 'expense').length, milk: recs.filter((r) => r.type === 'milk').length,
  };
  report.ok = report.checks.every((c) => c.ok);
  report.farmName = farm.settings.farmName;
  report.exportedAt = exportedAt || raw?.exportedAt || null;
  return { farm, report };
}
