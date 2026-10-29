// Checks return {code, severity: 'error'|'warn', field?}. Errors block a save; warnings inform.
import { saleTotals, offsetsC } from './ledger.mjs';

const err = (code, field) => ({ code, severity: 'error', field });
const warn = (code, field) => ({ code, severity: 'warn', field });

export function validateRecord(rec, ctx = {}) {
  const out = [];
  const today = ctx.today;
  if (!rec.day) out.push(err('day.required', 'day'));
  if (today && rec.day > today && ['milk', 'eggs', 'milkUse', 'sale', 'payment', 'medicine'].includes(rec.type)) out.push(err('day.future', 'day'));
  switch (rec.type) {
    case 'sale': {
      if (!rec.lines?.length) out.push(err('sale.noLines', 'lines'));
      rec.lines?.forEach((l, i) => {
        if (!l.direct && !(Number(l.qty) > 0)) out.push(err('qty.positive', `lines.${i}.qty`));
        if (!l.direct && !(l.priceC > 0)) out.push(err('price.positive', `lines.${i}.price`));
        if (l.direct && !(l.amountC > 0)) out.push(err('amount.positive', `lines.${i}.amount`));
      });
      const t = saleTotals(rec, ctx.tax);
      if (rec.discount?.kind === 'amount' && (rec.discount.valueC || 0) > t.grossC) out.push(err('discount.overNet', 'discount'));
      if (rec.discount?.kind === 'percent' && (rec.discount.value < 0 || rec.discount.value > 100)) out.push(err('discount.percent', 'discount'));
      if (t.totalC <= 0 && rec.lines?.length) out.push(err('amount.positive', 'total'));
      if ((rec.paidNowC || 0) < 0) out.push(err('amount.negative', 'paidNow'));
      if (!rec.customerId) {
        if ((rec.paidNowC || 0) < t.totalC) out.push(err('walkin.mustPayFull', 'paidNow'));
        if (rec.tenderC != null && rec.tenderC < t.totalC && rec.method === 'cash') out.push(err('tender.short', 'tender'));
      } else if ((rec.paidNowC || 0) > t.totalC) out.push(err('sale.overpaid', 'paidNow'));
      break;
    }
    case 'payment': {
      if (!rec.customerId) out.push(err('customer.required', 'customerId'));
      const total = (rec.cashC || 0) + offsetsC(rec);
      if (total <= 0) out.push(err('amount.positive', 'cash'));
      (rec.offsets || []).forEach((o, i) => {
        if (!(o.amountC > 0)) out.push(err('amount.positive', `offsets.${i}.amount`));
        if (!String(o.desc || '').trim()) out.push(err('offset.desc', `offsets.${i}.desc`));
      });
      if (ctx.dueC != null && total > ctx.dueC && !rec.allowCredit) out.push(err('pay.overDue', 'cash'));
      break;
    }
    case 'expense': {
      if (!rec.category) out.push(err('category.required', 'category'));
      if (!(rec.amountC > 0)) out.push(err('amount.positive', 'amount'));
      if ((rec.paidC || 0) > (rec.amountC || 0)) out.push(err('paid.overAmount', 'paid'));
      if (rec.source === 'person' && !rec.personId) out.push(err('person.required', 'personId'));
      if (rec.qty && rec.unitPriceC && Math.abs(Math.round(rec.qty * rec.unitPriceC) - rec.amountC) > 1) out.push(warn('qtyPrice.mismatch', 'amount'));
      break;
    }
    case 'supplierPay': {
      if (!rec.supplierId) out.push(err('supplier.required', 'supplierId'));
      if (!(rec.amountC > 0)) out.push(err('amount.positive', 'amount'));
      if (rec.source === 'person' && !rec.personId) out.push(err('person.required', 'personId'));
      if (ctx.dueC != null && rec.amountC > ctx.dueC && !rec.allowCredit) out.push(warn('supplierPay.overDue', 'amount'));
      break;
    }
    case 'capital': {
      if (!rec.personId) out.push(err('person.required', 'personId'));
      if (!(rec.amountC > 0)) out.push(err('amount.positive', 'amount'));
      break;
    }
    case 'milk': {
      if (!(Number(rec.liters) > 0)) out.push(err('qty.positive', 'liters'));
      if (!['am', 'pm', 'day'].includes(rec.session)) out.push(err('session.required', 'session'));
      break;
    }
    case 'milkUse': {
      if (!(Number(rec.liters) > 0)) out.push(err('qty.positive', 'liters'));
      if (!rec.reason) out.push(err('reason.required', 'reason'));
      break;
    }
    case 'eggs': {
      if (!(Number(rec.count) >= 0)) out.push(err('qty.positive', 'count'));
      if ((Number(rec.broken) || 0) > (Number(rec.count) || 0)) out.push(err('eggs.brokenOver', 'broken'));
      break;
    }
    case 'medicine': {
      if (!rec.animalId) out.push(err('animal.required', 'animalId'));
      if (!rec.kind) out.push(err('kind.required', 'kind'));
      break;
    }
    case 'transfer': {
      if (!(rec.amountC > 0)) out.push(err('amount.positive', 'amount'));
      break;
    }
    default:
  }
  return out;
}

/** Farm-wide checks that a change must not newly break. */
export function validateFarm(farm, snap) {
  return [...(snap.milk?.issues || []), ...(snap.eggs?.issues || [])];
}

/** Same party, same amount, same day: probably entered twice. */
export function findDuplicate(farm, rec) {
  const amt = (r) => r.totalC ?? r.cashC ?? r.amountC ?? r.liters ?? r.count;
  return (farm.records || []).find((r) => !r.deletedAt && r.id !== rec.id && r.type === rec.type && r.day === rec.day
    && (r.customerId || null) === (rec.customerId || null) && (r.supplierId || null) === (rec.supplierId || null)
    && (r.session || null) === (rec.session || null) && amt(r) === amt(rec));
}
