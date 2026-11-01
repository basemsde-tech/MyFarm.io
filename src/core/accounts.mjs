// Accounting views over the same records the screens use.
// Every money record becomes a balanced double-entry journal entry, so the
// profit and loss, balance sheet, trial balance and aging all tie back to the
// figures on the cash box and account screens.

import { live, customerInvoices, supplierBills, invoiceDueDay, offsetsC } from './ledger.mjs';

/* ── Chart of accounts ──
   Accounts are keys; some carry a party (customer, supplier or person). */
export const ACCOUNT_TYPES = {
  cash: 'asset', bank: 'asset', ar: 'asset',
  ap: 'liability', bills: 'liability', owed: 'liability', tax: 'liability',
  opening: 'equity', adjust: 'equity',
  rev: 'income', exp: 'expense',
};
export const typeOf = (acct) => ACCOUNT_TYPES[acct.split(':')[0]];
const money = (r) => (r === 'bank' ? 'bank' : 'cash');
const methodAcct = (m) => (m === 'card' || m === 'transfer' ? 'bank' : 'cash');

/** Split an amount across weights in whole cents, the remainder going to the last share. */
function split(totalC, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map((_, i) => (i === weights.length - 1 ? totalC : 0));
  let used = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return totalC - used;
    const v = Math.round((totalC * w) / sum);
    used += v;
    return v;
  });
}

/** The journal entry for one record, or null when it moves no money. */
export function entryFor(r) {
  const L = [];
  const dr = (acct, amountC, party) => { if (amountC) L.push({ acct, party: party || null, dr: amountC, cr: 0 }); };
  const cr = (acct, amountC, party) => { if (amountC) L.push({ acct, party: party || null, dr: 0, cr: amountC }); };
  switch (r.type) {
    case 'sale': {
      if (r.voided) return null;
      const T = r.totalC || 0;
      // Tax added on top makes total = net + tax; tax included means total already contains it. Either way revenue = total − tax.
      const X = Math.max(0, Math.min(T, r.taxC || 0));
      const net = T - X;
      const party = r.customerId || 'walkin';
      dr('ar', T, party);
      const lines = r.lines || [];
      const shares = split(net, lines.map((l) => Math.max(0, l.amountC || 0)));
      lines.forEach((l, i) => cr(`rev:${l.product || 'other'}`, shares[i]));
      if (!lines.length) cr('rev:other', net);
      cr('tax', X);
      if (r.paidNowC) { dr(methodAcct(r.method), r.paidNowC); cr('ar', r.paidNowC, party); }
      break;
    }
    case 'payment': {
      const cash = r.cashC || 0;
      if (r.keptBy) dr('owed', cash, r.keptBy); else dr(methodAcct(r.method), cash);
      for (const o of r.offsets || []) dr(`exp:${o.category || 'other'}`, o.amountC);
      cr('ar', cash + offsetsC(r), r.customerId);
      break;
    }
    case 'expense': {
      const A = r.amountC || 0;
      const P = Math.min(r.paidC || 0, A);
      const cat = `exp:${r.category || 'other'}`;
      if (r.source === 'customer') { dr(cat, A); cr('rev:customerPaid', A); break; }
      const payable = r.supplierId ? 'ap' : 'bills';
      const pparty = r.supplierId || null;
      dr(cat, A); cr(payable, A, pparty);
      if (P) {
        dr(payable, P, pparty);
        if (r.source === 'person') cr('owed', P, r.personId); else cr(money(r.source), P);
      }
      if (r.takenBy && r.source !== 'person' && !r.supplierId && P) { dr('owed', P, r.takenBy); cr('adjust', P); }
      break;
    }
    case 'supplierPay': {
      dr('ap', r.amountC, r.supplierId);
      if (r.source === 'person') cr('owed', r.amountC, r.personId); else cr(money(r.source), r.amountC);
      break;
    }
    case 'capital': {
      const acct = money(r.account);
      if (r.kind === 'inject') { dr(acct, r.amountC); cr('owed', r.amountC, r.personId); } else { dr('owed', r.amountC, r.personId); cr(acct, r.amountC); }
      break;
    }
    case 'medicine': {
      if (!r.costC) return null;
      dr('exp:medicine', r.costC); cr('cash', r.costC);
      break;
    }
    case 'opening': {
      // Cash carried forward when old years were closed; the other side is opening equity.
      if (!r.cashC) return null;
      if (r.cashC > 0) { dr('cash', r.cashC); cr('opening', r.cashC); } else { dr('opening', -r.cashC); cr('cash', -r.cashC); }
      break;
    }
    case 'transfer': {
      const from = money(r.fromAccount);
      dr(from === 'bank' ? 'cash' : 'bank', r.amountC); cr(from, r.amountC);
      break;
    }
    default:
      return null;
  }
  if (!L.length) return null;
  return { id: r.id, no: r.no || null, type: r.type, day: r.day, at: r.createdAt, record: r, lines: L };
}

/** Opening balances on customers, suppliers and people. */
function openingEntries(farm) {
  const out = [];
  const add = (id, day, lines, kind, party) => out.push({ id: `opening-${kind}-${id}`, day: day || '0000-00-00', at: '', type: 'opening', kind, party, lines });
  for (const c of farm.customers || []) if (c.openingC) add(c.id, c.openingDay, [{ acct: 'ar', party: c.id, dr: c.openingC, cr: 0 }, { acct: 'opening', party: null, dr: 0, cr: c.openingC }], 'customer', c.id);
  for (const s of farm.suppliers || []) if (s.openingC) add(s.id, s.openingDay, [{ acct: 'opening', party: null, dr: s.openingC, cr: 0 }, { acct: 'ap', party: s.id, dr: 0, cr: s.openingC }], 'supplier', s.id);
  for (const p of farm.people || []) if (p.openingC) add(p.id, '0000-00-00', [{ acct: 'opening', party: null, dr: p.openingC, cr: 0 }, { acct: 'owed', party: p.id, dr: 0, cr: p.openingC }], 'person', p.id);
  return out;
}

/** The general journal, oldest first. */
export function journal(farm, { from = '0000-00-00', to = '9999-12-31' } = {}) {
  const entries = [...openingEntries(farm)];
  for (const r of farm.records || []) {
    if (!live(r) || r.day > to) continue;
    const e = entryFor(r);
    if (e) entries.push(e);
  }
  return entries.filter((e) => e.day >= from && e.day <= to)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.at).localeCompare(String(b.at)));
}

/** Balances per account (and per party where kept), debit positive. */
export function trialBalance(farm, { to = '9999-12-31', from = '0000-00-00' } = {}) {
  const acc = new Map();
  let dr = 0, cr = 0;
  for (const e of journal(farm, { from, to })) {
    for (const l of e.lines) {
      const k = l.acct;
      const row = acc.get(k) || { acct: k, type: typeOf(k), dr: 0, cr: 0, parties: new Map() };
      row.dr += l.dr; row.cr += l.cr;
      if (l.party) row.parties.set(l.party, (row.parties.get(l.party) || 0) + l.dr - l.cr);
      acc.set(k, row);
      dr += l.dr; cr += l.cr;
    }
  }
  const rows = [...acc.values()].map((r) => ({ ...r, balance: r.dr - r.cr })).sort((a, b) => order(a.acct) - order(b.acct) || a.acct.localeCompare(b.acct));
  return { rows, totalDr: dr, totalCr: cr, balanced: dr === cr };
}
const ORDER = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 };
const order = (k) => ORDER[typeOf(k)] || 9;

/** Profit and loss for a period: revenue by product (before tax), expenses by item. */
export function profitAndLoss(farm, { from, to }) {
  const income = {};
  const expenses = {};
  for (const e of journal(farm, { from, to })) {
    for (const l of e.lines) {
      const [k, sub] = l.acct.split(':');
      if (k === 'rev') income[sub] = (income[sub] || 0) + l.cr - l.dr;
      if (k === 'exp') expenses[sub] = (expenses[sub] || 0) + l.dr - l.cr;
    }
  }
  const incomeC = Object.values(income).reduce((a, b) => a + b, 0);
  const expenseC = Object.values(expenses).reduce((a, b) => a + b, 0);
  return { from, to, income, expenses, incomeC, expenseC, profitC: incomeC - expenseC, marginPct: incomeC ? Math.round(((incomeC - expenseC) / incomeC) * 1000) / 10 : null };
}

/**
 * What the farm owns and owes on a day. Party balances are split by sign so a
 * customer in credit shows as money owed, and a person who owes the farm as an asset.
 */
export function balanceSheet(farm, { asOf = '9999-12-31' } = {}) {
  const tb = trialBalance(farm, { to: asOf });
  const get = (k) => tb.rows.find((r) => r.acct === k);
  const parties = (k) => [...(get(k)?.parties || new Map()).values()];
  const pos = (arr) => arr.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const neg = (arr) => 0 - arr.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  const ar = parties('ar'), ap = parties('ap'), owed = parties('owed');
  const assets = {
    cash: get('cash')?.balance || 0,
    bank: get('bank')?.balance || 0,
    receivable: pos(ar),
    supplierCredit: pos(ap),
    peopleOwe: pos(owed),
  };
  const liabilities = {
    payable: neg(ap),
    bills: 0 - (get('bills')?.balance || 0),
    owedPeople: neg(owed),
    customerCredit: neg(ar),
    tax: 0 - (get('tax')?.balance || 0),
  };
  let pl = 0;
  for (const r of tb.rows) if (r.type === 'income' || r.type === 'expense') pl -= r.balance;
  const equity = {
    opening: 0 - (get('opening')?.balance || 0),
    adjust: 0 - (get('adjust')?.balance || 0),
    earnings: pl,
  };
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const totalAssets = sum(assets), totalLiab = sum(liabilities), totalEquity = sum(equity);
  return { asOf, assets, liabilities, equity, totalAssets, totalLiab, totalEquity, balanced: totalAssets === totalLiab + totalEquity };
}

export const BUCKETS = ['current', 'd30', 'd60', 'd90', 'd90p'];
function bucketOf(dueDay, today) {
  const days = Math.round((new Date(today + 'T12:00:00') - new Date(dueDay + 'T12:00:00')) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'd90p';
}
const blank = () => ({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, total: 0 });

/** What customers owe, by how late it is. Ties to the receivable on the cash box. */
export function receivablesAging(farm, snap, { today, termsDays = 30 }) {
  const rows = [];
  const totals = blank();
  for (const c of farm.customers || []) {
    const due = snap.cust[c.id]?.dueC || 0;
    if (!due) continue;
    const row = { id: c.id, name: c.name, ...blank(), invoices: [] };
    const inv = customerInvoices(farm, c.id, snap, { today, termsDays }).filter((i) => i.dueC > 0);
    let covered = 0;
    for (const i of inv) {
      const b = bucketOf(i.dueDay, today);
      row[b] += i.dueC; covered += i.dueC;
      row.invoices.push({ ...i, bucket: b });
    }
    // Whatever the invoices don't explain is the opening balance, the oldest debt.
    if (due > covered) row.d90p += due - covered;
    row.total = due;
    for (const k of BUCKETS) totals[k] += row[k];
    totals.total += due;
    rows.push(row);
  }
  rows.sort((a, b) => b.total - a.total);
  return { rows, totals };
}

/** What the farm owes suppliers and other unpaid bills, by how late it is. */
export function payablesAging(farm, snap, { today }) {
  const rows = [];
  const totals = blank();
  for (const s of farm.suppliers || []) {
    const due = snap.sup[s.id]?.dueC || 0;
    if (!due) continue;
    const row = { id: s.id, name: s.name, kind: 'supplier', ...blank() };
    for (const b of supplierBills(farm, s.id, { today }).bills) {
      if (b.dueC <= 0) continue;
      const k = bucketOf(b.dueDay || (b.day.startsWith('0000') ? today : b.day), today);
      row[k] += b.dueC;
    }
    row.total = due;
    const sumB = BUCKETS.reduce((a, k) => a + row[k], 0);
    if (sumB !== due) row.current += due - sumB;
    for (const k of BUCKETS) totals[k] += row[k];
    totals.total += due;
    rows.push(row);
  }
  const other = { id: 'bills', name: null, kind: 'bills', ...blank() };
  for (const r of farm.records || []) {
    if (!live(r) || r.type !== 'expense' || r.supplierId || r.source === 'person' || r.source === 'customer') continue;
    const open = r.amountC - Math.min(r.paidC || 0, r.amountC);
    if (open <= 0) continue;
    other[bucketOf(r.dueDay || r.day, today)] += open;
    other.total += open;
  }
  if (other.total) { for (const k of BUCKETS) totals[k] += other[k]; totals.total += other.total; rows.push(other); }
  rows.sort((a, b) => b.total - a.total);
  return { rows, totals };
}

/** Tax charged on sales, by month, for a period. */
export function taxSummary(farm, { from, to }) {
  const months = {};
  let taxC = 0, netC = 0, count = 0;
  for (const r of farm.records || []) {
    if (!live(r) || r.type !== 'sale' || r.voided || r.day < from || r.day > to || !r.taxC) continue;
    const m = r.day.slice(0, 7);
    const row = (months[m] ||= { month: m, taxC: 0, netC: 0, count: 0 });
    row.taxC += r.taxC; row.netC += r.totalC - r.taxC; row.count += 1;
    taxC += r.taxC; netC += r.totalC - r.taxC; count += 1;
  }
  return { months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)), taxC, netC, count };
}

/** Invoice register: every sale as an invoice with number, due date, paid and balance. */
export function invoiceRegister(farm, snap, { today, termsDays = 30, from = '0000-00-00', to = '9999-12-31' } = {}) {
  const byId = new Map();
  for (const c of farm.customers || []) for (const i of customerInvoices(farm, c.id, snap, { today, termsDays })) byId.set(i.sale.id, i);
  const out = [];
  for (const r of farm.records || []) {
    if (!live(r) || r.type !== 'sale' || r.day < from || r.day > to) continue;
    const i = byId.get(r.id);
    const walkin = !r.customerId;
    const status = r.voided ? 'voided' : walkin ? 'paid' : i?.status || 'unpaid';
    out.push({
      sale: r, no: r.no, day: r.day, customerId: r.customerId, totalC: r.totalC,
      paidC: r.voided ? 0 : walkin ? r.totalC : i?.paidC || 0, dueC: r.voided || walkin ? 0 : i?.dueC || 0,
      dueDay: walkin ? r.day : i?.dueDay || invoiceDueDay(r, termsDays), status,
    });
  }
  return out.sort((a, b) => (b.no || 0) - (a.no || 0) || b.day.localeCompare(a.day));
}

/** Double-entry journal as CSV rows for an accountant. */
export function journalRows(farm, { from, to, label = (k) => k, party = (p) => p || '', number = (e) => e.no || '' } = {}) {
  const rows = [];
  for (const e of journal(farm, { from, to })) {
    for (const l of e.lines) rows.push([e.day.startsWith('0000') ? '' : e.day, number(e), e.type, label(l.acct), party(l.party, l.acct), l.dr ? (l.dr / 100).toFixed(2) : '', l.cr ? (l.cr / 100).toFixed(2) : '']);
  }
  return rows;
}

/** Printed document number: invoices use the farm's prefix, receipts RCT-. */
export function docNo(r, settings = {}) {
  if (!r?.no) return '';
  const n = String(r.no).padStart(4, '0');
  if (r.type === 'payment') return `${settings.doc?.rctPrefix || 'RCT-'}${n}`;
  return `${settings.doc?.prefix || 'INV-'}${n}`;
}
