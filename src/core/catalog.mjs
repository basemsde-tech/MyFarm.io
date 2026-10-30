// Product, expense and purpose catalogues. Labels live in i18n under the same keys.

export const PRODUCTS = {
  milk: { unit: 'L', stock: 'milk' },
  labneh: { unit: 'kg' },
  cheese: { unit: 'kg' },
  eggs: { unit: 'egg', stock: 'eggs' },
  animal: { unit: 'head' },
  other: { unit: 'unit' },
};

export const EXPENSE_GROUPS = {
  feedLive: ['feed', 'hay', 'vet', 'medicine', 'livestock'],
  machine: ['fuel', 'transport', 'repairs', 'servicing', 'parts'],
  property: ['electricity', 'water', 'fencing', 'supplies'],
  office: ['licensing', 'insurance', 'software', 'stationery'],
  finance: ['loan', 'rent', 'vendor', 'opening'],
  otherGrp: ['labour', 'packaging', 'other'],
};

export const CATEGORY_UNIT = {
  feed: 'kg', hay: 'kg', fuel: 'L', water: 'L', livestock: 'head', vet: 'dose', medicine: 'dose',
};

export const CATEGORY_ICON = {
  feed: '🌾', hay: '🌾', vet: '🩺', medicine: '💊', livestock: '🐄', fuel: '⛽', transport: '🚚', repairs: '🔧',
  servicing: '🛠', parts: '⚙️', electricity: '💡', water: '💧', fencing: '🧱', supplies: '📦', licensing: '📄',
  insurance: '🛡', software: '💻', stationery: '✏️', loan: '🏦', rent: '🏠', vendor: '🤝', opening: '📘',
  labour: '👷', packaging: '🧴', other: '•',
};

export function groupOf(category, custom = []) {
  for (const [g, list] of Object.entries(EXPENSE_GROUPS)) if (list.includes(category)) return g;
  const c = custom.find((x) => x.key === category);
  return c?.group || 'otherGrp';
}

/** Customer-paid farm costs (expense offsets on a payment). */
export const OFFSET_TYPES = ['fuel', 'labour', 'transport', 'packaging', 'repairs', 'feed', 'other'];

export const MEDICINE_KINDS = ['vaccine', 'antibiotic', 'vitamins', 'minerals', 'deworming', 'mastitis', 'painkiller', 'otherTreatment'];
export const MEDICINE_SUGGEST = ['AD3E', 'B complex', 'Calcium', 'Selenium + E', 'Multivitamin', 'Mineral mix'];

export const MILK_USE_REASONS = ['home', 'calves', 'waste', 'other'];

/**
 * Person (manager / funder) purposes. Each purpose posts into a real record type:
 * inject      -> capital record kind inject (cash in, farm owes them more)
 * cashOut     -> capital record kind withdraw purpose return (cash out, farm owes them less)
 * personal    -> capital record kind withdraw purpose personal
 * outOfPocket -> expense record with source person (no drawer move, farm owes them more)
 * supplier    -> supplierPay record with source person
 * retained    -> payment record with keptBy (revenue that skipped the drawer, farm owes them less)
 */
export const PERSON_PURPOSES = ['inject', 'cashOut', 'outOfPocket', 'supplier', 'retained', 'personal'];
export const OUT_OF_POCKET_CATEGORIES = ['feed', 'fuel', 'vet', 'labour', 'transport', 'repairs', 'electricity', 'supplies', 'packaging', 'other'];

export const ROLES = ['owner', 'book', 'milker', 'worker', 'health'];

const PERMS = {
  owner: ['*'],
  book: ['money.create', 'money.edit', 'money.delete', 'herd', 'production', 'settings', 'lock.override'],
  milker: ['production', 'money.create.sale', 'herd.view'],
  worker: ['production', 'herd', 'money.create.sale'],
  health: ['herd', 'production'],
};
/** Real permission checks (enhanced from role stamps). */
export function can(role, action) {
  const list = PERMS[role] || [];
  if (list.includes('*')) return action !== 'never';
  if (list.includes(action)) return true;
  if (action.startsWith('money.create.') && list.includes('money.create')) return true;
  if (action === 'herd.view' && list.includes('herd')) return true;
  return false;
}

/* ── Milk "used for" cards ──
 * Built-in uses plus the farm's own, kept in settings.milkUseReasons.
 * Older farms stored plain names; those still work (the name is also the id).
 * A custom use that records point to is hidden, never removed, so old entries keep their name. */
export const MILK_USE_EMOJI = { home: '🏠', calves: '🐄', waste: '🗑️', other: '📦' };
export const USE_EMOJIS = ['🥛', '🧀', '🧈', '🍶', '☕', '🐄', '🐐', '🐑', '🐕', '🐖', '🏠', '🎁', '🤝', '🧪', '🗑️', '📦'];

export function milkUses(settings = {}, { all = false } = {}) {
  const own = (settings.milkUseReasons || []).map((x) => (typeof x === 'string' ? { id: x, name: x, emoji: '🥛' } : x)).filter((x) => x && x.id);
  const list = [...MILK_USE_REASONS.map((id) => ({ id, builtin: true, emoji: MILK_USE_EMOJI[id] })), ...own];
  return all ? list : list.filter((x) => !x.hidden);
}

export function milkUseName(settings, id, t) {
  const u = milkUses(settings, { all: true }).find((x) => x.id === id);
  if (u && !u.builtin) return u.name;
  const k = `use.${id}`;
  return t && t(k) !== k ? t(k) : id;
}

/** Add or rename a custom use. Returns the new list for settings.milkUseReasons. */
export function saveMilkUse(settings, { id, name, emoji }, makeId) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return settings.milkUseReasons || [];
  const own = milkUses(settings, { all: true }).filter((x) => !x.builtin);
  if (id) return own.map((x) => (x.id === id ? { ...x, name: clean, emoji: emoji || x.emoji } : x));
  const same = own.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  if (same) return own.map((x) => (x === same ? { ...x, hidden: false, emoji: emoji || x.emoji } : x));
  return [...own, { id: makeId(), name: clean, emoji: emoji || '🥛' }];
}

/** Remove a custom use; hide it instead when entries still point to it. */
export function dropMilkUse(settings, id, records = []) {
  const own = milkUses(settings, { all: true }).filter((x) => !x.builtin);
  const used = records.some((r) => r.type === 'milkUse' && r.reason === id && !r.deletedAt);
  return used ? own.map((x) => (x.id === id ? { ...x, hidden: true } : x)) : own.filter((x) => x.id !== id);
}
