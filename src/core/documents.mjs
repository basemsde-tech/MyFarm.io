// Attached documents: health certificates, purchase papers, ear-tag registrations and
// the like, on animals, customers, suppliers, people and workers. The farm keeps the
// details; the file itself lives in the device's file store under fileId, and backups
// carry both.

import { newId, CommandError } from './commands.mjs';
import { daysBetween } from './species.mjs';

export const DOC_KINDS = ['health', 'vaccination', 'purchase', 'tag', 'sale', 'contract', 'id', 'invoice', 'other'];
export const DOC_LISTS = ['animals', 'customers', 'suppliers', 'people', 'workers', 'orders'];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function docsFor(farm, list, id) {
  return (farm.documents || []).filter((d) => !d.deletedAt && d.owner?.list === list && d.owner?.id === id)
    .sort((a, b) => String(b.day || b.at).localeCompare(String(a.day || a.at)));
}

export function docState(d, today, soonDays = 30) {
  if (!d.expiry) return 'none';
  const left = daysBetween(today, d.expiry);
  return left < 0 ? 'expired' : left <= soonDays ? 'soon' : 'valid';
}

/** Documents that have expired or expire soon, soonest first. */
export function expiringDocs(farm, today, soonDays = 30) {
  return (farm.documents || []).filter((d) => !d.deletedAt && d.expiry && ['expired', 'soon'].includes(docState(d, today, soonDays)))
    .map((d) => ({ ...d, daysLeft: daysBetween(today, d.expiry), state: docState(d, today, soonDays) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

export function addDocument(farm, { owner, kind = 'other', title = '', day = '', expiry = '', number = '', note = '', fileId = null, fileName = '', mime = '', size = 0 }, actor, now) {
  if (!owner?.list || !owner?.id || !DOC_LISTS.includes(owner.list)) throw new CommandError('badList');
  if (!title.trim() && !fileName) throw new CommandError('doc.titleRequired');
  if (size > MAX_FILE_BYTES) throw new CommandError('doc.tooBig');
  const at = (now ? new Date(now) : new Date()).toISOString();
  const d = { id: newId('doc'), owner, kind: DOC_KINDS.includes(kind) ? kind : 'other', title: title.trim() || fileName, day, expiry, number: number.trim(), note, fileId, fileName, mime, size, at, by: actor?.id || null, byName: actor?.name || '—', updatedAt: at };
  return { ...farm, rev: (farm.rev || 0) + 1, documents: [...(farm.documents || []), d] };
}

export function editDocument(farm, id, patch, actor, now) {
  const at = (now ? new Date(now) : new Date()).toISOString();
  if (!(farm.documents || []).some((d) => d.id === id)) throw new CommandError('notFound');
  return { ...farm, rev: (farm.rev || 0) + 1, documents: farm.documents.map((d) => (d.id === id ? { ...d, ...patch, id, owner: d.owner, updatedAt: at, updatedBy: actor?.id || null } : d)) };
}

export function removeDocument(farm, id, actor, now) {
  const at = (now ? new Date(now) : new Date()).toISOString();
  return { ...farm, rev: (farm.rev || 0) + 1, documents: (farm.documents || []).map((d) => (d.id === id ? { ...d, deletedAt: at, deletedBy: actor?.id || null, deletedByName: actor?.name || '—', updatedAt: at } : d)) };
}

/** File ids the farm still points to (for backups and clean-up). */
export function liveFileIds(farm) {
  return [...new Set((farm.documents || []).filter((d) => !d.deletedAt && d.fileId).map((d) => d.fileId))];
}
