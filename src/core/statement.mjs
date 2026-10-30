// Statements are drafts over the ledger. Generating one never rewrites a record.
import { live } from './ledger.mjs';

/** Ledger lines for one party: {day, at, ref, kind, desc, chargeC, creditC}. */
export function partyLines(farm, party, id) {
  const lines = [];
  const recs = (farm.records || []).filter(live);
  if (party === 'customer') {
    const c = (farm.customers || []).find((x) => x.id === id);
    if (c?.openingC) lines.push({ day: c.openingDay || '0000-00-00', ref: 'opening', kind: 'opening', chargeC: c.openingC, creditC: 0 });
    for (const r of recs) {
      if (r.type === 'sale' && r.customerId === id && !r.voided) {
        lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'sale', record: r, chargeC: r.totalC, creditC: 0 });
        if (r.paidNowC) lines.push({ day: r.day, at: r.createdAt + '1', ref: r.id, kind: 'paidAtSale', record: r, chargeC: 0, creditC: r.paidNowC });
      }
      if (r.type === 'payment' && r.customerId === id) {
        if (r.cashC) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: r.keptBy ? 'paymentKept' : 'payment', record: r, chargeC: 0, creditC: r.cashC });
        for (const o of r.offsets || []) lines.push({ day: r.day, at: r.createdAt + '2', ref: r.id, kind: 'offset', record: r, desc: o.desc, category: o.category, chargeC: 0, creditC: o.amountC });
      }
    }
  } else if (party === 'supplier') {
    const s = (farm.suppliers || []).find((x) => x.id === id);
    if (s?.openingC) lines.push({ day: s.openingDay || '0000-00-00', ref: `opening-${id}`, kind: 'opening', chargeC: s.openingC, creditC: 0 });
    for (const r of recs) {
      if (r.type === 'expense' && r.supplierId === id) {
        lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'bill', record: r, category: r.category, chargeC: r.amountC, creditC: 0 });
        if (r.paidC) lines.push({ day: r.day, at: r.createdAt + '1', ref: r.id, kind: 'paidAtBill', record: r, chargeC: 0, creditC: Math.min(r.paidC, r.amountC) });
      }
      if (r.type === 'supplierPay' && r.supplierId === id) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'supplierPay', record: r, chargeC: 0, creditC: r.amountC });
    }
  } else if (party === 'person') {
    const p = (farm.people || []).find((x) => x.id === id);
    if (p?.openingC) lines.push({ day: '0000-00-00', ref: 'opening', kind: 'opening', chargeC: p.openingC, creditC: 0 });
    // For people, "charge" = farm owes them more; "credit" = farm owes them less.
    for (const r of recs) {
      if (r.type === 'capital' && r.personId === id) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: r.kind === 'inject' ? 'inject' : r.purpose === 'personal' ? 'personal' : 'cashOut', record: r, chargeC: r.kind === 'inject' ? r.amountC : 0, creditC: r.kind === 'inject' ? 0 : r.amountC });
      if (r.type === 'expense' && r.takenBy === id && r.source !== 'person' && !r.supplierId) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'cashTake', category: r.category, record: r, chargeC: 0, creditC: Math.min(r.paidC || 0, r.amountC) });
      if (r.type === 'expense' && r.source === 'person' && r.personId === id) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'outOfPocket', category: r.category, record: r, chargeC: Math.min(r.paidC || 0, r.amountC), creditC: 0 });
      if (r.type === 'supplierPay' && r.source === 'person' && r.personId === id) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'supplierFromPocket', record: r, chargeC: r.amountC, creditC: 0 });
      if (r.type === 'payment' && r.keptBy === id) lines.push({ day: r.day, at: r.createdAt, ref: r.id, kind: 'retained', record: r, chargeC: 0, creditC: r.cashC || 0 });
    }
  }
  lines.sort((a, b) => a.day.localeCompare(b.day) || String(a.at).localeCompare(String(b.at)));
  return lines;
}

/**
 * Period statement. opening = all charges − credits before `from`.
 * running = opening + charge − credit. closing = opening + charges − credits.
 * hidden: set of line indexes the user hid; custom: extra lines the user added.
 */
export function statement(lines, { from = '0000-00-00', to = '9999-12-31', hidden = new Set(), custom = [] } = {}) {
  let openingC = 0;
  for (const l of lines) if (l.day < from) openingC += l.chargeC - l.creditC;
  const period = [...lines.filter((l) => l.day >= from && l.day <= to), ...custom.map((c) => ({ ...c, custom: true }))]
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.at || '').localeCompare(String(b.at || '')));
  let bal = openingC;
  let chargesC = 0, creditsC = 0;
  const rows = [];
  period.forEach((l, i) => {
    const key = l.custom ? `c${i}` : `${l.ref}|${l.kind}|${l.at}`;
    if (hidden.has(key)) return;
    bal += l.chargeC - l.creditC;
    chargesC += l.chargeC;
    creditsC += l.creditC;
    rows.push({ ...l, key, balanceC: bal });
  });
  return { openingC, rows, chargesC, creditsC, closingC: openingC + chargesC - creditsC };
}

export function periodRange(kind, today) {
  const d = new Date(today + 'T12:00:00');
  const iso = (x) => x.toISOString().slice(0, 10);
  if (kind === 'month') return { from: today.slice(0, 8) + '01', to: today };
  if (kind === 'lastMonth') {
    const a = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    const b = new Date(d.getFullYear(), d.getMonth(), 0, 12);
    return { from: iso(a), to: iso(b) };
  }
  if (kind === 'week') { const a = new Date(d); a.setDate(a.getDate() - 6); return { from: iso(a), to: today }; }
  if (kind === '30') { const a = new Date(d); a.setDate(a.getDate() - 29); return { from: iso(a), to: today }; }
  if (kind === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  if (kind === 'today') return { from: today, to: today };
  return { from: '0000-00-00', to: '9999-12-31' };
}
