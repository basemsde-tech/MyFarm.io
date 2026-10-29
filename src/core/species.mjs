// One table for everything species-specific. Do not scatter these numbers through screens.

export const SPECIES = {
  cow: {
    mode: 'individual', product: 'milk', idLabel: 'tag', gestation: 283, gestationRange: [279, 287],
    dryOff: 60, heat: 21, checkFrom: 30, checkTo: 45, weaning: 90, weight: true, wool: false,
    young: { ar: 'عجل', en: 'Calf' }, name: { ar: 'أبقار', en: 'Cattle' }, one: { ar: 'بقرة', en: 'Cow' },
    breeds: ['Holstein', 'Friesian', 'Jersey', 'Brown Swiss', 'Simmental', 'Montbéliarde', 'Ayrshire', 'Guernsey', 'Angus', 'Damascus', 'Jawlani', 'Baladi', 'Cross'],
  },
  goat: {
    mode: 'individual', product: 'milk', idLabel: 'tag', gestation: 150, gestationRange: [145, 155],
    dryOff: 50, heat: 21, checkFrom: 30, checkTo: 45, weaning: 60, weight: true, wool: false,
    young: { ar: 'جدي', en: 'Kid' }, name: { ar: 'ماعز', en: 'Goats' }, one: { ar: 'عنزة', en: 'Goat' },
    breeds: ['Shami / Damascus', 'Baladi', 'Alpine', 'Saanen', 'Toggenburg', 'Anglo-Nubian', 'Boer', 'Angora', 'Cyprus', 'Cross'],
  },
  sheep: {
    mode: 'individual', product: 'milk', idLabel: 'tag', gestation: 152, gestationRange: [145, 155],
    dryOff: 45, heat: 17, checkFrom: 30, checkTo: 45, weaning: 75, weight: true, wool: true,
    young: { ar: 'حَمَل', en: 'Lamb' }, name: { ar: 'أغنام', en: 'Sheep' }, one: { ar: 'نعجة', en: 'Ewe' },
    breeds: ['Awassi', 'Baladi', 'Naimi', 'Najdi', 'Barki', 'Romanov', 'Suffolk', 'Chios', 'Cross'],
  },
  chicken: {
    mode: 'flock', product: 'eggs', idLabel: 'flock', gestation: 21, gestationRange: [21, 21],
    dryOff: 0, heat: 0, checkFrom: 0, checkTo: 0, weaning: 0, weight: false, wool: false,
    young: { ar: 'فرخ', en: 'Chick' }, name: { ar: 'دواجن', en: 'Poultry' }, one: { ar: 'قطيع دواجن', en: 'Flock' },
    breeds: ['Layer', 'Lohmann', 'ISA Brown', 'Baladi', 'Fayoumi', 'Sasso', 'Broiler', 'Cobb', 'Ross', 'Turkey', 'Cross'],
  },
};

export const RUMINANT_STATUS = ['healthy', 'served', 'pregnant', 'lactating', 'dry', 'sick', 'sold', 'dead'];
export const FLOCK_STATUS = ['laying', 'growing', 'sick', 'stopped', 'sold'];

export function statusesFor(species) {
  return SPECIES[species]?.mode === 'flock' ? FLOCK_STATUS : RUMINANT_STATUS;
}

const DAY = 86400000;
export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setTime(d.getTime() + n * DAY);
  return isoDay(d);
}
export function isoDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
}

/**
 * Reproduction timeline from a service date. Returns steps with dates and state.
 * check: 'pregnant' | 'open' | undefined
 */
export function reproTimeline(species, serviceDay, today, check) {
  const s = SPECIES[species];
  if (!s || s.mode === 'flock' || !serviceDay) return null;
  const since = daysBetween(serviceDay, today);
  const due = addDays(serviceDay, s.gestation);
  const steps = [
    { key: 'service', day: serviceDay, done: true },
    { key: 'heatWatch', day: addDays(serviceDay, s.heat), done: since > s.heat + 3 || check === 'pregnant' },
    { key: 'pregCheck', day: addDays(serviceDay, s.checkFrom), to: addDays(serviceDay, s.checkTo), done: !!check },
    { key: 'dryOff', day: addDays(due, -s.dryOff), done: false },
    { key: 'birth', day: due, from: addDays(serviceDay, s.gestationRange[0]), to: addDays(serviceDay, s.gestationRange[1]), done: false },
  ];
  let next = steps.find((x) => !x.done);
  const overdue = check !== 'open' && since > s.gestationRange[1];
  return { since, due, steps, next: next?.key, overdue, failed: check === 'open' };
}
