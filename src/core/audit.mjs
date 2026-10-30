// Farm-wide activity log. Entries come from two places:
//  · the records themselves (created, edited with reason, deleted, restored, voided) — always complete;
//  · farm.audit for everything else: list and settings changes, sign-ins, failed codes,
//    locks, backups, restores, farm switches.

export const AUDIT_MAX = 4000;
export const SECURITY = ['signin', 'signout', 'failed', 'lockout', 'autolock', 'pinSet', 'backup', 'restore', 'export', 'switchFarm'];

export function appendAudit(farm, entry) {
  const e = { at: new Date().toISOString(), ...entry };
  return { ...farm, audit: [...(farm.audit || []), e].slice(-AUDIT_MAX) };
}

/** Which lists (other than records) and settings differ between two farms. */
export function changedLists(a, b) {
  const out = [];
  for (const k of ['customers', 'suppliers', 'people', 'animals', 'workers', 'obligations', 'profiles', 'orders', 'documents']) if (a[k] !== b[k]) out.push(k);
  if (a.settings !== b.settings) out.push('settings');
  return out;
}

/** The whole log, newest first. */
export function activityLog(farm) {
  const out = [];
  for (const r of farm.records || []) {
    out.push({ at: String(r.createdAt || ''), by: r.createdByName || '—', byId: r.createdBy, kind: 'created', type: r.type, recordId: r.id, day: r.day });
    for (const h of r.history || []) {
      const reason = String(h.reason || '');
      const kind = reason.startsWith('void:') ? 'voided' : reason === 'void undone' ? 'unvoided' : reason === 'restored' ? 'restored' : 'edited';
      out.push({ at: String(h.at || ''), by: h.byName || '—', byId: h.by, kind, type: r.type, recordId: r.id, day: r.day, reason: kind === 'voided' ? reason.replace(/^void:\w+\s*/, '') : kind === 'edited' ? reason : '', fields: h.fields || [] });
    }
    if (r.deletedAt) out.push({ at: String(r.deletedAt), by: r.deletedByName || '—', byId: r.deletedBy, kind: 'deleted', type: r.type, recordId: r.id, day: r.day, reason: r.deleteReason || '' });
  }
  for (const a of farm.audit || []) out.push({ ...a, at: String(a.at || ''), by: a.byName || '—', byId: a.by, kind: a.kind || 'change' });
  return out.filter((e) => e.at).sort((x, y) => y.at.localeCompare(x.at));
}
