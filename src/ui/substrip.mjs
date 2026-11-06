// Colour and size rules for the account sub-tabs (acctstrip.jsx). Plain JS so it can be tested.
export const STRIP_COLORS = 8;
const MAX = 10;

/** Pure: open `id` (adds it with a random colour no open tab uses; keeps the newest MAX). */
export function openSub(tabs, id, rnd = Math.random) {
  if (tabs.some((x) => x.id === id)) return tabs;
  const used = new Set(tabs.map((x) => x.c));
  const free = [...Array(STRIP_COLORS).keys()].filter((c) => !used.has(c));
  const pool = free.length ? free : [...Array(STRIP_COLORS).keys()];
  const c = pool[Math.floor(rnd() * pool.length) % pool.length];
  let next = [...tabs, { id, c }];
  while (next.length > MAX) next = next.slice(1);
  return next;
}

