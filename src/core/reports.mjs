// Period reports using the same day keys and cent maths as the screens.
import { live, compute } from './ledger.mjs';
import { milkLots, saleMilkL } from './milk.mjs';

export function periodReport(farm, from, to) {
  const recs = (farm.records || []).filter((r) => live(r) && r.day >= from && r.day <= to);
  const snapEnd = compute(farm, { to, from });
  const snapStart = compute(farm, { to: prevDay(from) });
  const lots = milkLots(recs);
  const milkL = lots.reduce((s, l) => s + l.liters, 0);
  const byProduct = {};
  let salesC = 0, collectedAtSaleC = 0, walkinC = 0;
  let milkSoldL = 0;
  for (const r of recs) {
    if (r.type !== 'sale' || r.voided) continue;
    salesC += r.totalC;
    collectedAtSaleC += r.paidNowC || 0;
    if (!r.customerId) walkinC += r.totalC;
    milkSoldL += saleMilkL(r);
    for (const l of r.lines) {
      const p = (byProduct[l.product] ||= { qty: 0, amountC: 0 });
      p.qty += Number(l.qty) || 0;
    }
    // Attribute the invoice total across lines proportionally for the product split.
    const gross = r.lines.reduce((s, l) => s + (l.amountC || 0), 0) || 1;
    for (const l of r.lines) byProduct[l.product].amountC += Math.round((r.totalC * (l.amountC || 0)) / gross);
  }
  const byCategory = {};
  for (const e of snapEnd.expenses) {
    if (e.day < from || e.day > to) continue;
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amountC;
  }
  const flows = snapEnd.flows.filter((f) => f.day >= from && f.day <= to && f.account === 'cash');
  const cashIn = flows.filter((f) => f.dir > 0).reduce((s, f) => s + f.amountC, 0);
  const cashOut = flows.filter((f) => f.dir < 0).reduce((s, f) => s + f.amountC, 0);
  const eggs = recs.filter((r) => r.type === 'eggs').reduce((s, r) => s + (Number(r.count) || 0) - (Number(r.broken) || 0), 0);
  const expenseC = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return {
    from, to, milkL, milkSoldL, eggs,
    salesC, walkinC, collectedAtSaleC, byProduct,
    expenseC, byCategory, profitC: salesC - expenseC,
    cash: { openingC: snapStart.cashC, inC: cashIn, outC: cashOut, closingC: snapStart.cashC + cashIn - cashOut },
    receivableC: snapEnd.receivableC, supplierDueC: snapEnd.supplierDueC,
  };
}

function prevDay(day) {
  if (!day || day <= '0000-00-01') return '0000-00-00';
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
