// The ledger engine. Every balance is derived from records in integer cents.
// No stored balance can drift. One record is one complete money cluster.

import { mulCents, sumC } from './money.mjs';
import { milkStock, eggStock } from './milk.mjs';

export const live = (r) => r && !r.deletedAt;

/** Compute sale totals from lines, discount and tax settings. */
export function saleTotals({ lines = [], discount = { kind: 'amount', value: 0 } }, tax = {}) {
  const lineAmounts = lines.map((l) => (l.direct ? Math.round(l.amountC || 0) : mulCents(Number(l.qty) || 0, l.priceC || 0)));
  const grossC = sumC(lineAmounts);
  let discountC = discount?.kind === 'percent'
    ? Math.round((grossC * (Number(discount.value) || 0)) / 100)
    : Math.round(discount?.valueC || 0);
  discountC = Math.max(0, Math.min(discountC, grossC));
  const netC = grossC - discountC;
  let taxC = 0;
  let totalC = netC;
  if (tax?.enabled && tax.rate > 0) {
    const rate = tax.rate / 100;
    if (tax.inclusive) {
      const base = Math.round(netC / (1 + rate));
      taxC = netC - base;
    } else {
      taxC = Math.round(netC * rate);
      totalC = netC + taxC;
    }
  }
  return { lineAmounts, grossC, discountC, netC, taxC, totalC };
}

export const offsetsC = (p) => sumC(p.offsets || [], (o) => o.amountC);

function bump(map, id, field, by) {
  if (!id) return;
  const row = (map[id] ||= {});
  row[field] = (row[field] || 0) + by;
}

/**
 * Full snapshot of the farm as of day `to` (inclusive).
 * flows are drawer (cash) and bank movements: {id, day, dir:+1|-1, amountC, account, kind, ...}.
 */
export function compute(farm, { to = '9999-12-31', from = '0000-00-00', now } = {}) {
  const recs = (farm.records || []).filter((r) => live(r) && r.day <= to);
  const s = {
    cashC: 0, bankC: 0, capitalC: 0,
    cust: {}, sup: {}, people: {},
    payablesC: 0, revenueC: 0, expenseC: 0, expenseCashC: 0,
    flows: [], expenses: [],
  };
  for (const c of farm.customers || []) if (c.openingC) bump(s.cust, c.id, 'chargeC', c.openingC);
  for (const p of farm.suppliers || []) if (p.openingC) bump(s.sup, p.id, 'billC', p.openingC);
  for (const p of farm.people || []) if (p.openingC) bump(s.people, p.id, 'owedC', p.openingC);

  const flow = (r, dir, amountC, account, kind, extra = {}) => {
    if (!amountC) return;
    if (account === 'bank') s.bankC += dir * amountC; else s.cashC += dir * amountC;
    s.flows.push({ id: r.id, day: r.day, at: r.createdAt, dir, amountC, account: account === 'bank' ? 'bank' : 'cash', kind, by: r.createdByName, ...extra });
  };
  const sourcePay = (r, amountC, kind, extra) => {
    if (r.source === 'customer') return; // a customer paid it for the farm: no drawer move
    if (r.source === 'person') bump(s.people, r.personId, 'owedC', amountC);
    else flow(r, -1, amountC, r.source === 'bank' ? 'bank' : 'cash', kind, extra);
  };
  const expRow = (r, e) => s.expenses.push({ id: r.id, day: r.day, recordType: r.type, ...e });

  for (const r of recs) {
    const inPeriod = r.day >= from;
    switch (r.type) {
      case 'sale': {
        if (r.voided) break;
        if (inPeriod) s.revenueC += r.totalC;
        if (r.customerId) {
          bump(s.cust, r.customerId, 'chargeC', r.totalC);
          bump(s.cust, r.customerId, 'creditC', r.paidNowC || 0);
        }
        flow(r, +1, r.paidNowC || 0, r.method === 'cash' || !r.method ? 'cash' : 'bank', 'sale', { customerId: r.customerId, method: r.method });
        break;
      }
      case 'payment': {
        const off = offsetsC(r);
        bump(s.cust, r.customerId, 'creditC', (r.cashC || 0) + off);
        if (r.keptBy) {
          bump(s.people, r.keptBy, 'owedC', -(r.cashC || 0));
        } else {
          flow(r, +1, r.cashC || 0, r.method === 'cash' || !r.method ? 'cash' : 'bank', 'payment', { customerId: r.customerId, method: r.method });
        }
        for (const o of r.offsets || []) {
          if (inPeriod) s.expenseC += o.amountC;
          expRow(r, { category: o.category, amountC: o.amountC, paidC: o.amountC, origin: 'customer', customerId: r.customerId, note: o.desc });
        }
        break;
      }
      case 'expense': {
        const amt = r.amountC || 0;
        const paid = Math.min(r.paidC || 0, amt);
        if (inPeriod) s.expenseC += amt;
        if (r.supplierId) {
          bump(s.sup, r.supplierId, 'billC', amt);
          bump(s.sup, r.supplierId, 'paidC', paid);
        } else if (r.source !== 'customer') {
          s.payablesC += amt - paid;
        }
        sourcePay(r, paid, 'expense', { category: r.category, supplierId: r.supplierId, personId: r.personId });
        // Someone took drawer cash for this cost: it leaves the box and the farm owes them less.
        if (r.takenBy && r.source !== 'person' && !r.supplierId) bump(s.people, r.takenBy, 'owedC', -paid);
        if (r.capital) s.capitalC -= paid;
        if (inPeriod && r.source !== 'person' && r.source !== 'customer') s.expenseCashC += paid;
        expRow(r, { category: r.category, amountC: amt, paidC: paid, origin: r.source === 'person' ? 'person' : r.source === 'customer' ? 'customer' : r.supplierId ? 'supplier' : 'farm', supplierId: r.supplierId, personId: r.personId, vendor: r.vendor, note: r.note, dueDay: r.dueDay });
        break;
      }
      case 'supplierPay': {
        bump(s.sup, r.supplierId, 'paidC', r.amountC || 0);
        sourcePay(r, r.amountC || 0, 'supplierPay', { supplierId: r.supplierId, personId: r.personId });
        if (inPeriod && r.source !== 'person') s.expenseCashC += 0; // bill already counted in accrual
        break;
      }
      case 'capital': {
        const amt = r.amountC || 0;
        if (r.kind === 'inject') {
          flow(r, +1, amt, r.account, 'capitalIn', { personId: r.personId });
          s.capitalC += amt;
          bump(s.people, r.personId, 'owedC', amt);
        } else {
          flow(r, -1, amt, r.account, r.purpose === 'personal' ? 'personal' : 'capitalOut', { personId: r.personId, purpose: r.purpose });
          if (r.purpose !== 'personal') s.capitalC -= amt;
          bump(s.people, r.personId, 'owedC', -amt);
        }
        break;
      }
      case 'medicine': {
        if (r.costC > 0) {
          if (inPeriod) { s.expenseC += r.costC; s.expenseCashC += r.costC; }
          flow(r, -1, r.costC, 'cash', 'expense', { category: 'medicine', animalId: r.animalId });
          expRow(r, { category: 'medicine', amountC: r.costC, paidC: r.costC, origin: 'farm', animalId: r.animalId, note: r.name });
        }
        break;
      }
      case 'opening': {
        // Balances carried forward when old years were closed.
        flow(r, +1, r.cashC || 0, 'cash', 'opening');
        s.capitalC += r.capitalC || 0;
        break;
      }
      case 'transfer': {
        // Move money between the cash box and the bank.
        flow(r, -1, r.amountC, r.fromAccount, 'transferOut');
        flow(r, +1, r.amountC, r.fromAccount === 'bank' ? 'cash' : 'bank', 'transferIn');
        break;
      }
      default:
    }
  }
  // Supplier bills show what has really been paid on them, including payments made later.
  {
    const bills = new Map(); const pays = new Map();
    const push = (m, k, v) => { let x = m.get(k); if (!x) m.set(k, (x = [])); x.push(v); };
    for (const p of farm.suppliers || []) if (p.openingC) push(bills, p.id, { id: `opening-${p.id}`, day: p.openingDay || '0000-00-00', amountC: p.openingC, paidC: 0, opening: true });
    for (const e of s.expenses) if (e.recordType === 'expense' && e.supplierId) { e.paidAtEntryC = e.paidC; push(bills, e.supplierId, e); }
    for (const r of recs) if (r.type === 'supplierPay' && r.supplierId) push(pays, r.supplierId, r);
    for (const [id, list] of bills) {
      allocateSupplier(list, pays.get(id) || [], now ? new Date(now).toISOString().slice(0, 10) : null);
      const op = list.find((b) => b.opening);
      if (op) bump(s.sup, id, 'openingDueC', op.dueC);
    }
  }
  for (const v of Object.values(s.cust)) {
    const net = (v.chargeC || 0) - (v.creditC || 0);
    v.dueC = Math.max(0, net);
    v.creditBalC = Math.max(0, -net);
  }
  for (const v of Object.values(s.sup)) {
    const net = (v.billC || 0) - (v.paidC || 0);
    v.dueC = Math.max(0, net);
    v.creditBalC = Math.max(0, -net);
  }
  s.receivableC = sumC(Object.values(s.cust), (v) => v.dueC);
  s.supplierDueC = sumC(Object.values(s.sup), (v) => v.dueC);
  const milk = milkStock(recs, now);
  const eggs = eggStock(recs);
  s.milk = milk;
  s.eggs = eggs;
  s.flows.sort((a, b) => a.day.localeCompare(b.day) || String(a.at).localeCompare(String(b.at)));
  return s;
}

/**
 * Display status of each customer invoice. Payments are never split into rows;
 * the account-level credit pool is applied oldest-first for status only, so no
 * invoice can look overdue beyond the true account due.
 */
/** An invoice is due on its own due date, or the payment terms after its day. */
export function invoiceDueDay(sale, termsDays = 30) {
  if (sale.dueDay) return sale.dueDay;
  const d = new Date(sale.day + 'T12:00:00');
  d.setDate(d.getDate() + Math.max(0, termsDays ?? 30));
  return d.toISOString().slice(0, 10);
}

// Records grouped by customer / supplier, built once per records array (lists are replaced on every change).
const BY_PARTY = new WeakMap();
function partyIndex(records) {
  let ix = BY_PARTY.get(records);
  if (ix) return ix;
  ix = { sales: new Map(), bills: new Map(), pays: new Map() };
  const push = (m, k, r) => { let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(r); };
  for (const r of records) {
    if (!live(r)) continue;
    if (r.type === 'sale' && r.customerId && !r.voided) push(ix.sales, r.customerId, r);
    else if (r.type === 'expense' && r.supplierId) push(ix.bills, r.supplierId, r);
    else if (r.type === 'supplierPay' && r.supplierId) push(ix.pays, r.supplierId, r);
  }
  for (const a of ix.sales.values()) a.sort((x, y) => x.day.localeCompare(y.day) || String(x.createdAt).localeCompare(String(y.createdAt)));
  BY_PARTY.set(records, ix);
  return ix;
}

export function customerInvoices(farm, customerId, snap, { today, termsDays = 30 } = {}) {
  const c = snap.cust[customerId] || {};
  const sales = partyIndex(farm.records || []).sales.get(customerId) || [];
  const opening = (farm.customers || []).find((x) => x.id === customerId)?.openingC || 0;
  let pool = (c.creditC || 0) - Math.min(opening, c.creditC || 0);
  return sales.map((sale) => {
    const apply = Math.min(pool, sale.totalC);
    pool -= apply;
    const dueC = sale.totalC - apply;
    let status = dueC <= 0 ? 'paid' : apply > 0 ? 'partial' : 'unpaid';
    const dueDay = invoiceDueDay(sale, termsDays);
    if (dueC > 0 && today && dueDay < today) status = 'overdue';
    return { sale, paidC: apply, dueC, status, dueDay };
  });
}


/**
 * Spread a supplier's payments over their bills: a payment that names a bill goes there first,
 * everything else pays the oldest bills first. Bills carry {id, day, amountC, paidC} (paidC = paid
 * when the bill was entered); they come back with paidC, dueC and status filled in.
 */
function allocateSupplier(bills, pays, today) {
  bills.sort((a, b) => a.day.localeCompare(b.day));
  let pool = 0;
  for (const p of pays) {
    const b = p.billId && bills.find((x) => x.id === p.billId);
    if (b) {
      const take = Math.max(0, Math.min(b.amountC - b.paidC, p.amountC));
      b.paidC += take;
      pool += p.amountC - take;
    } else pool += p.amountC || 0;
  }
  for (const b of bills) {
    const take = Math.max(0, Math.min(b.amountC - b.paidC, pool));
    b.paidC += take;
    pool -= take;
    b.dueC = b.amountC - b.paidC;
    b.status = b.dueC <= 0 ? 'paid' : b.paidC > 0 ? 'partial' : 'unpaid';
    if (b.dueC > 0 && b.dueDay && today && b.dueDay < today) b.status = 'overdue';
  }
  return pool; // paid ahead of any bill: the supplier owes the farm goods or money
}

/** Open supplier bills, with opening balance as a bill like any other. */
export function supplierBills(farm, supplierId, { today } = {}) {
  const sup = (farm.suppliers || []).find((x) => x.id === supplierId);
  const bills = [];
  if (sup?.openingC) bills.push({ id: `opening-${supplierId}`, day: sup.openingDay || '0000-00-00', amountC: sup.openingC, paidC: 0, category: 'opening', opening: true });
  const ix = partyIndex(farm.records || []);
  for (const r of ix.bills.get(supplierId) || []) bills.push({ id: r.id, day: r.day, amountC: r.amountC, paidC: Math.min(r.paidC || 0, r.amountC), category: r.category, dueDay: r.dueDay, record: r });
  const pool = allocateSupplier(bills, ix.pays.get(supplierId) || [], today);
  return { bills, creditC: pool };
}

export function payStatus(amountC, paidC) {
  if (paidC >= amountC) return 'paid';
  if (paidC <= 0) return 'unpaid';
  return 'partial';
}

/** Compare two snapshots and list the visible effects of a change. */
export function diffSnapshots(a, b, names = {}) {
  const out = [];
  const add = (key, before, after, ref, kind = 'money') => {
    if (Math.abs((after || 0) - (before || 0)) > (kind === 'qty' ? 0.0005 : 0)) out.push({ key, before: before || 0, after: after || 0, ref, kind });
  };
  add('cash', a.cashC, b.cashC);
  add('bank', a.bankC, b.bankC);
  add('capital', a.capitalC, b.capitalC);
  const ids = (x, y) => new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const id of ids(a.cust, b.cust)) {
    const A = a.cust[id] || {}, B = b.cust[id] || {};
    add('custDue', A.dueC, B.dueC, { id, name: names.customer?.(id) });
    add('custCredit', A.creditBalC, B.creditBalC, { id, name: names.customer?.(id) });
  }
  for (const id of ids(a.sup, b.sup)) {
    const A = a.sup[id] || {}, B = b.sup[id] || {};
    add('supDue', A.dueC, B.dueC, { id, name: names.supplier?.(id) });
    add('supCredit', A.creditBalC, B.creditBalC, { id, name: names.supplier?.(id) });
  }
  for (const id of ids(a.people, b.people)) add('personOwed', a.people[id]?.owedC, b.people[id]?.owedC, { id, name: names.person?.(id) });
  add('payables', a.payablesC, b.payablesC);
  add('expenses', a.expenseC, b.expenseC);
  add('revenue', a.revenueC, b.revenueC);
  add('milk', a.milk.stockL, b.milk.stockL, null, 'qty');
  add('eggs', a.eggs.stock, b.eggs.stock, null, 'count');
  return out;
}
