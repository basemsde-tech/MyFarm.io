// Totals for lines picked in a list (the selection bar). Pure functions, tested in test/selection.test.mjs.

/** What a record adds to a selection total: money, or a quantity (litres, eggs). */
export function measureOf(r) {
  switch (r.type) {
    case 'milk': case 'milkUse': return { qty: Number(r.liters) || 0, unit: 'L' };
    case 'eggs': return { qty: (Number(r.count) || 0) - (Number(r.broken) || 0), unit: 'egg' };
    case 'eggUse': return { qty: Number(r.count) || 0, unit: 'egg' };
    default: return {};
  }
}

/**
 * Adds up the picked lines. Each line: { type, typeLabel, label, amountC, sign (+1/−1 for money in/out), qty, unit, skip, extras }.
 * The headline is a net (signed lines), a total (one kind of line), or nothing (mixed kinds: shown per kind).
 */
export function summarise(items) {
  const counted = items.filter((i) => !i.skip);
  const skipped = items.length - counted.length;
  const types = new Map();
  const labels = new Map();
  const extras = new Map();
  for (const i of counted) {
    for (const [map, k, name] of [[types, i.type, i.typeLabel], [labels, `${i.type}|${i.label}`, i.label]]) {
      const g = map.get(k) || { name, n: 0, amountC: 0, hasAmt: false, qty: 0, unit: i.unit || null };
      g.n += 1;
      if (i.amountC != null) { g.amountC += (i.sign || 1) * i.amountC; g.hasAmt = true; }
      if (i.qty != null) g.qty += i.qty;
      map.set(k, g);
    }
    for (const [k, x] of Object.entries(i.extras || {})) {
      const e = extras.get(k) || { label: x.label, c: 0 };
      e.c += x.c || 0;
      extras.set(k, e);
    }
  }
  const money = counted.filter((i) => i.amountC != null);
  const signed = money.length > 0 && money.every((i) => i.sign === 1 || i.sign === -1);
  const inC = money.filter((i) => i.sign === 1).reduce((s, i) => s + i.amountC, 0);
  const outC = money.filter((i) => i.sign === -1).reduce((s, i) => s + i.amountC, 0);
  const oneType = types.size === 1 ? [...types.values()][0] : null;
  let head = null; // { kind: 'money'|'qty', value, label: 'total'|'net', plus }
  if (signed) head = { kind: 'money', value: inC - outC, label: inC && outC ? 'net' : 'total', plus: inC > 0 };
  else if (oneType?.hasAmt) head = { kind: 'money', value: oneType.amountC, label: 'total' };
  else if (oneType?.unit) head = { kind: 'qty', value: oneType.qty, unit: oneType.unit, label: 'total' };
  // Average / largest / smallest of the headline figure.
  const vals = head?.kind === 'money' ? money.map((i) => (signed ? i.sign * i.amountC : i.amountC)) : head?.kind === 'qty' ? counted.filter((i) => i.qty != null).map((i) => i.qty) : [];
  const stats = vals.length > 1 ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, max: Math.max(...vals), min: Math.min(...vals) } : null;
  return { n: items.length, skipped, types: [...types.values()], labels: [...labels.values()], extras: [...extras.values()], head, signed, inC, outC, stats };
}

