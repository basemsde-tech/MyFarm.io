// Milk stock is kept in litres. Kilograms are an entry and display unit only.

export const KG_PER_L = 1.03;
export const kgToL = (kg) => kg / KG_PER_L;
export const lToKg = (l) => l * KG_PER_L;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function litresOf(qty, unit) {
  return unit === 'kg' ? kgToL(Number(qty) || 0) : Number(qty) || 0;
}

export function saleMilkL(sale) {
  let l = 0;
  for (const line of sale.lines || []) if (line.product === 'milk') l += litresOf(line.qty, line.unit);
  return r3(l);
}
export function saleEggs(sale) {
  let n = 0;
  for (const line of sale.lines || []) if (line.product === 'eggs') n += Number(line.qty) || 0;
  return n;
}

const SESSION_HOUR = { am: 6, day: 12, pm: 17 };
const SESSION_ORDER = { am: 0, day: 1, pm: 2 };

const live = (r) => !r.deletedAt;
const newer = (a, b) => ((a.createdAt || '') >= (b.createdAt || '') ? a : b);

/**
 * Deduplicate milk rows into lots.
 * Per day+species: morning/evening bulk rows win; else a single whole-day bulk row; else per-animal rows.
 * Per-animal key is day + animal + session; bulk key is day + session + species.
 */
export function milkLots(records) {
  const byDay = new Map();
  for (const r of records) {
    if (r.type !== 'milk' || !live(r)) continue;
    const k = `${r.day}|${r.species || 'cow'}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(r);
  }
  const lots = [];
  for (const [k, rows] of byDay) {
    const [day, species] = k.split('|');
    const bulk = new Map();
    const per = new Map();
    for (const r of rows) {
      if (r.animalId) {
        const pk = `${r.animalId}|${r.session}`;
        per.set(pk, per.has(pk) ? newer(per.get(pk), r) : r);
      } else {
        bulk.set(r.session, bulk.has(r.session) ? newer(bulk.get(r.session), r) : r);
      }
    }
    let chosen;
    if (bulk.has('am') || bulk.has('pm')) chosen = ['am', 'pm'].filter((s) => bulk.has(s)).map((s) => [s, [bulk.get(s)]]);
    else if (bulk.has('day')) chosen = [['day', [bulk.get('day')]]];
    else {
      const bySession = {};
      for (const r of per.values()) (bySession[r.session] ||= []).push(r);
      chosen = Object.entries(bySession);
    }
    for (const [session, list] of chosen) {
      const liters = r3(list.reduce((s, r) => s + (Number(r.liters) || 0), 0));
      if (liters <= 0) continue;
      lots.push({
        key: `${day}|${species}|${session}`, day, species, session, liters,
        ids: list.map((r) => r.id), by: list[0].createdByName,
        at: new Date(`${day}T${String(SESSION_HOUR[session] ?? 12).padStart(2, '0')}:00:00`).getTime(),
      });
    }
  }
  lots.sort((a, b) => a.day.localeCompare(b.day) || SESSION_ORDER[a.session] - SESSION_ORDER[b.session]);
  return lots;
}

/** Everything that takes milk out of the tank, in time order. */
export function milkConsumption(records) {
  const out = [];
  for (const r of records) {
    if (!live(r)) continue;
    if (r.type === 'sale') {
      const l = saleMilkL(r);
      if (l <= 0) continue;
      if (r.voided && r.voided.mode === 'restore') continue;
      out.push({ id: r.id, day: r.day, at: r.createdAt, liters: l, kind: r.voided ? 'writeoff' : 'sale' });
    } else if (r.type === 'milkUse') {
      out.push({ id: r.id, day: r.day, at: r.createdAt, liters: r3(Number(r.liters) || 0), kind: 'use', reason: r.reason });
    }
  }
  out.sort((a, b) => a.day.localeCompare(b.day) || String(a.at).localeCompare(String(b.at)));
  return out;
}

/** FIFO tank. Returns stock, remaining lots with age, and any oversell issues. */
export function milkStock(records, now = Date.now()) {
  const lots = milkLots(records).map((l) => ({ ...l, left: l.liters }));
  const cons = milkConsumption(records);
  const issues = [];
  let li = 0;
  let produced = 0;
  let consumed = 0;
  const queue = [];
  for (const c of cons) {
    while (li < lots.length && lots[li].day <= c.day) {
      queue.push(lots[li]);
      produced += lots[li].liters;
      li++;
    }
    let need = c.liters;
    consumed += c.liters;
    for (const lot of queue) {
      if (need <= 1e-9) break;
      const take = Math.min(lot.left, need);
      lot.left = r3(lot.left - take);
      need = r3(need - take);
    }
    if (need > 0.0005) issues.push({ code: 'milk.oversell', severity: 'error', recordId: c.id, day: c.day, shortL: need });
  }
  while (li < lots.length) produced += lots[li++].liters;
  const remaining = lots.filter((l) => l.left > 0.0005).map((l) => {
    const hours = Math.max(0, (now - l.at) / 3600000);
    const fresh = hours < 12 ? 'fresh' : hours < 36 ? 'good' : hours < 72 ? 'aging' : 'old';
    return { ...l, hours, fresh };
  });
  const soldL = cons.filter((c) => c.kind === 'sale').reduce((s, c) => s + c.liters, 0);
  const usedL = cons.filter((c) => c.kind !== 'sale').reduce((s, c) => s + c.liters, 0);
  return {
    producedL: r3(produced), soldL: r3(soldL), usedL: r3(usedL),
    stockL: r3(Math.max(0, produced - consumed)), rawL: r3(produced - consumed),
    lots: remaining, issues,
  };
}

export function eggStock(records) {
  let collected = 0, broken = 0, sold = 0, used = 0;
  const issues = [];
  const evs = [];
  for (const r of records) {
    if (!live(r)) continue;
    if (r.type === 'eggs') evs.push({ day: r.day, at: r.createdAt, d: (Number(r.count) || 0) - (Number(r.broken) || 0), r });
    if (r.type === 'eggUse') evs.push({ day: r.day, at: r.createdAt, d: -(Number(r.count) || 0), r });
    if (r.type === 'sale' && !(r.voided?.mode === 'restore')) {
      const n = saleEggs(r);
      if (n) evs.push({ day: r.day, at: r.createdAt, d: -n, r });
    }
  }
  evs.sort((a, b) => a.day.localeCompare(b.day) || (b.d - a.d) || String(a.at).localeCompare(String(b.at)));
  let bal = 0;
  for (const e of evs) {
    bal += e.d;
    if (e.r.type === 'eggs') { collected += Number(e.r.count) || 0; broken += Number(e.r.broken) || 0; } else if (e.r.type === 'eggUse') used -= e.d; else sold -= e.d;
    if (bal < 0) { issues.push({ code: 'eggs.oversell', severity: 'error', recordId: e.r.id, day: e.day }); }
  }
  return { collected, broken, sold, used, stock: Math.max(0, bal), issues };
}
