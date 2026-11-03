// Items on a purchase bill: what was bought, how many, at what price. The bill's amount is their sum.
// Stored on the expense record as `items: [{ desc, qty, unit, priceC, amountC }]` (optional; older bills have none).

/** One line's amount, in whole cents. */
export const itemAmountC = (it) => Math.round((Number(it?.qty) || 0) * (Number(it?.priceC) || 0));

/** Items ready to save: trimmed, amounts worked out, blank lines dropped. */
export function cleanItems(items) {
  return (items || [])
    .map((it) => ({ desc: String(it.desc || '').trim(), qty: Number(it.qty) || 0, unit: it.unit || 'item', priceC: Math.round(Number(it.priceC) || 0), amountC: itemAmountC(it) }))
    .filter((it) => it.desc || it.qty || it.priceC);
}

export const itemsTotalC = (items) => cleanItems(items).reduce((s, i) => s + i.amountC, 0);

/** The bill's quantity when every item uses the same unit (keeps reports' quantities right). */
export function itemsQty(items) {
  const list = cleanItems(items);
  if (!list.length) return null;
  const units = new Set(list.map((i) => i.unit));
  return units.size === 1 ? { qty: Math.round(list.reduce((s, i) => s + i.qty, 0) * 1000) / 1000, unit: list[0].unit } : null;
}

/** Short text for lists: "Hay 50 bale · Salt 2 bag". */
export function itemsText(items, t, fmtQty) {
  return cleanItems(items).map((i) => `${i.desc || ''} ${fmtQty(i.qty)} ${t(`u.${i.unit}`)}`.trim()).join(' · ');
}
