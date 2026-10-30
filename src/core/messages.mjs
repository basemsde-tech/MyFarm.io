// Messages sent from the app: WhatsApp links, invoice / receipt / statement texts and
// payment reminders. Text builders take the app's t() and fmt() so they stay pure.

import { customerInvoices } from './ledger.mjs';
import { daysBetween } from './species.mjs';

/** International digits for wa.me: 03 123 456 → 9613123456; +961 … kept; 00961 … → 961 … */
export function intlPhone(phone, countryCode = '961') {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1).replace(/\D/g, '');
  if (d.startsWith('00')) return d.slice(2);
  const cc = String(countryCode || '').replace(/\D/g, '');
  if (cc && d.startsWith(cc) && d.length > cc.length + 6) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return cc + d;
}

export function waUrl(phone, text, countryCode) {
  const n = intlPhone(phone, countryCode);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

const dayTxt = (d, lang) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** Invoice or receipt summary for a sale. */
export function saleText({ farm, sale, inv, t, fmt, lang, number, productName }) {
  const s = farm.settings;
  const out = [`*${s.farmName || t('brand')}*`, `${sale.customerId ? t('sale.invoice') : t('sale.receipt')} ${number} · ${dayTxt(sale.day, lang)}`, ''];
  for (const l of sale.lines || []) out.push(`• ${productName(l)}: ${fmt(l.amountC)}`);
  if (sale.discountC) out.push(`${t('sale.discount')}: −${fmt(sale.discountC)}`);
  if (sale.taxC) out.push(`${t('sale.tax')}: ${fmt(sale.taxC)}`);
  out.push(`*${t('total')}: ${fmt(sale.totalC)}*`);
  if (inv && sale.customerId) {
    out.push(`${t('doc.paidToDate')}: ${fmt(inv.paidC)}`);
    if (inv.dueC > 0) out.push(`*${t('doc.balanceDue')}: ${fmt(inv.dueC)}*`, `${t('doc.due')}: ${dayTxt(inv.dueDay, lang)}`);
  }
  return finish(out, s, t);
}

export function receiptText({ farm, pay, t, fmt, lang, number, balanceC }) {
  const s = farm.settings;
  const out = [`*${s.farmName || t('brand')}*`, `${t('doc.paymentReceipt')} ${number} · ${dayTxt(pay.day, lang)}`, '', `${t('doc.cashReceived')}: ${fmt(pay.cashC || 0)}`];
  for (const o of pay.offsets || []) out.push(`${t('doc.paidForUs')}: ${fmt(o.amountC)}${o.desc ? ` (${o.desc})` : ''}`);
  if (balanceC != null) out.push(`${t('msg.balanceNow')}: ${fmt(balanceC)}`);
  return finish(out, s, t);
}

export function statementText({ farm, customer, st, t, fmt, lang, from, to }) {
  const s = farm.settings;
  const out = [`*${s.farmName || t('brand')}*`, `${t('cust.statement')} — ${customer.name}`, `${dayTxt(from, lang)} – ${dayTxt(to, lang)}`, '',
    `${t('cash.opening')}: ${fmt(st.openingC)}`, `${t('msg.charges')}: ${fmt(st.chargesC)}`, `${t('msg.credits')}: ${fmt(st.creditsC)}`, `*${t('cash.closing')}: ${fmt(st.closingC)}*`];
  return finish(out, s, t);
}

export function orderText({ farm, o, supplier, t, fmt, lang, number, catName }) {
  const s = farm.settings;
  const out = [`*${s.farmName || t('brand')}*`, `${t('po.title1')} ${number} · ${dayTxt(o.day, lang)}`, supplier ? `${t('exp.supplier')}: ${supplier.name}` : '', ''];
  for (const l of o.lines || []) out.push(`• ${l.desc || catName(l.category)}: ${l.qty} ${t(`u.${l.unit}`)}${l.priceC ? ` × ${fmt(l.priceC)}` : ''}`);
  out.push(`*${t('total')}: ${fmt((o.lines || []).reduce((a, l) => a + Math.round(l.qty * (l.priceC || 0)), 0))}*`);
  if (o.expectedDay) out.push(`${t('po.expected')}: ${dayTxt(o.expectedDay, lang)}`);
  if (o.note) out.push('', o.note);
  return finish(out, s, t);
}

function finish(lines, s, t) {
  const tail = [s.messaging?.signature, s.farmPhone].filter(Boolean);
  return [...lines.filter((x, i) => x !== '' || lines[i - 1] !== ''), ...(tail.length ? ['', ...tail] : [])].join('\n').trim();
}

/** Customers with money overdue, oldest first, with when they were last reminded. */
export function overdueCustomers(farm, snap, { today, termsDays = 30, remindAfterDays = 7 } = {}) {
  const out = [];
  for (const c of farm.customers || []) {
    if (c.deletedAt || !snap.cust[c.id]?.dueC) continue;
    const invs = customerInvoices(farm, c.id, snap, { today, termsDays }).filter((i) => i.dueC > 0);
    const late = invs.filter((i) => i.status === 'overdue');
    const openingLate = c.openingC && !invs.length;
    if (!late.length && !openingLate) continue;
    const oldest = late.reduce((m, i) => (!m || i.dueDay < m ? i.dueDay : m), null);
    const last = (c.reminders || []).reduce((m, r) => (!m || r.at > m.at ? r : m), null);
    const lastDay = last ? last.at.slice(0, 10) : null;
    out.push({
      customer: c, dueC: snap.cust[c.id].dueC, overdueC: late.reduce((s, i) => s + i.dueC, 0) || snap.cust[c.id].dueC,
      invoices: late, oldestDue: oldest, daysLate: oldest ? daysBetween(oldest, today) : null,
      last, reminders: (c.reminders || []).length, remindNow: !lastDay || daysBetween(lastDay, today) >= remindAfterDays,
    });
  }
  return out.sort((a, b) => (b.daysLate || 0) - (a.daysLate || 0) || b.overdueC - a.overdueC);
}

export function reminderText({ farm, row, t, fmt, lang, number }) {
  const s = farm.settings;
  const lines = [t('msg.remHello', { n: row.customer.name }), '', t('msg.remBody', { a: fmt(row.overdueC), f: s.farmName || t('brand') })];
  for (const i of row.invoices.slice(0, 8)) lines.push(`• ${number(i.sale)} · ${dayTxt(i.sale.day, lang)} · ${fmt(i.dueC)} (${t('msg.dueOn', { d: dayTxt(i.dueDay, lang) })})`);
  if (row.dueC > row.overdueC) lines.push('', t('msg.remTotal', { a: fmt(row.dueC) }));
  lines.push('', t('msg.remClose'));
  return finish(lines, s, t);
}

/** Log a reminder on the customer. */
export function logReminder(farm, customerId, { at = new Date().toISOString(), actor, channel = 'whatsapp', amountC = 0 } = {}) {
  return { ...farm, rev: (farm.rev || 0) + 1, customers: farm.customers.map((c) => (c.id === customerId ? { ...c, reminders: [...(c.reminders || []), { at, by: actor?.id || null, byName: actor?.name || '—', channel, amountC }].slice(-50), updatedAt: at } : c)) };
}
