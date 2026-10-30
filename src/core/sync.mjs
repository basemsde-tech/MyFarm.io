// Per-record merge. Two devices never erase each other's work:
// each record and list row wins by its own updatedAt; tombstones keep purged rows gone.

export const LISTS = ['records', 'customers', 'suppliers', 'people', 'animals', 'workers', 'profiles', 'obligations', 'orders', 'documents'];

const ts = (x) => x?.updatedAt || x?.createdAt || '';

function mergeList(a = [], b = [], dead) {
  const map = new Map();
  for (const x of a) map.set(x.id, x);
  for (const y of b) {
    const x = map.get(y.id);
    if (!x) map.set(y.id, y);
    else if (ts(y) > ts(x) || (ts(y) === ts(x) && (y.history?.length || 0) > (x.history?.length || 0))) map.set(y.id, y);
  }
  return [...map.values()].filter((x) => !dead.has(x.id));
}

export function mergeFarms(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const tomb = new Map();
  for (const t of [...(local.tombstones || []), ...(remote.tombstones || [])]) tomb.set(t.id, t);
  const dead = new Set(tomb.keys());
  const out = { ...local };
  for (const k of LISTS) out[k] = mergeList(local[k], remote[k], dead);
  out.settings = ts(remote.settings) > ts(local.settings) ? remote.settings : local.settings;
  out.tombstones = [...tomb.values()].slice(-5000);
  out.rev = Math.max(local.rev || 0, remote.rev || 0) + 1;
  out.recovery = local.recovery || remote.recovery;
  return out;
}

/** Records changed since a revision timestamp; what a device needs to push. */
export function changedSince(farm, sinceIso) {
  const out = {};
  for (const k of LISTS) out[k] = (farm[k] || []).filter((x) => ts(x) > (sinceIso || ''));
  return out;
}
