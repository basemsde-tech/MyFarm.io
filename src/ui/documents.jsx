import React, { useEffect, useRef, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Sheet, Select, TextInput, TextArea, DateInput, dayLabel, IconButton } from './kit.jsx';
import { DOC_KINDS, MAX_FILE_BYTES, addDocument, editDocument, removeDocument, docsFor, docState } from '../core/documents.mjs';
import { can } from '../core/catalog.mjs';
import { fileToDataUrl, dataUrlToBlob } from './vault.js';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isImage = (m) => /^image\//.test(m || '');

/** Shrink large photos before storing them; other files are kept as they are. */
async function prepare(file) {
  if (isImage(file.type) && file.size > 900 * 1024 && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.85);
      return { url, mime: 'image/jpeg', size: Math.round((url.length * 3) / 4) };
    } catch { /* fall through */ }
  }
  return { url: await fileToDataUrl(file), mime: file.type || 'application/octet-stream', size: file.size };
}

/** Documents panel for any animal, customer, supplier, person, worker or order. */
export function Attachments({ list, id, title }) {
  const { farm, t, ui, today, lang, actor } = useApp();
  const docs = docsFor(farm, list, id);
  const canEdit = !!actor && (can(actor.role, 'herd') || can(actor.role, 'money.create'));
  return (
    <section className="panel docs-panel">
      <div className="panel-head">
        <h2><Icon name="file" size={18} /> {title || t('docs.title')}{docs.length > 0 && <span className="count num">{docs.length}</span>}</h2>
        {canEdit && <Button size="sm" icon="plus" onClick={() => ui.open('document', { owner: { list, id } })}>{t('docs.add')}</Button>}
      </div>
      {docs.length ? (
        <ul className="doc-list">
          {docs.map((d) => {
            const st = docState(d, today);
            return (
              <li key={d.id}>
                <button type="button" className="doc-item" onClick={() => ui.open('document', { record: d, owner: d.owner })}>
                  <span className={`doc-ico k-${d.kind}`}><Icon name={isImage(d.mime) ? 'image' : 'file'} size={18} /></span>
                  <span className="doc-text">
                    <b>{d.title}</b>
                    <span className="muted small">{[t(`dk.${d.kind}`), d.number, d.day && dayLabel(d.day, lang, { day: 'numeric', month: 'short', year: 'numeric' }), d.size ? kb(d.size) : t('docs.noFile')].filter(Boolean).join(' · ')}</span>
                  </span>
                  {d.expiry && <Pill tone={st === 'expired' ? 'bad' : st === 'soon' ? 'warn' : 'good'}>{st === 'expired' ? t('docs.expired') : t('docs.until', { d: dayLabel(d.expiry, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</Pill>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">{t('docs.none')}</p>}
    </section>
  );
}

/** Add or view/edit one document. */
export function DocumentSheet({ record, owner, onClose }) {
  const { t, commit, actor, files, toast, today, lang } = useApp();
  const [f, setF] = useState(record ? { ...record } : { kind: owner?.list === 'animals' ? 'health' : 'other', title: '', day: today, expiry: '', number: '', note: '' });
  const [file, setFile] = useState(null); // {url, mime, size, name}
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  useEffect(() => {
    let live = true;
    if (record?.fileId) files.get(record.fileId).then((u) => live && setPreview(u));
    return () => { live = false; };
  }, [record?.fileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (fl) => {
    if (!fl) return;
    if (fl.size > MAX_FILE_BYTES * 1.5) { toast(t('e.doc.tooBig'), { tone: 'bad' }); return; }
    setBusy(true);
    try {
      const p = await prepare(fl);
      if (p.size > MAX_FILE_BYTES) { toast(t('e.doc.tooBig'), { tone: 'bad' }); return; }
      setFile({ ...p, name: fl.name });
      setPreview(p.url);
      if (!f.title) set({ title: fl.name.replace(/\.[^.]+$/, '') });
    } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      let fileId = record?.fileId || null;
      let meta = {};
      if (file) { fileId = await files.save(file.url); meta = { fileName: file.name, mime: file.mime, size: file.size }; }
      const fields = { kind: f.kind, title: f.title, day: f.day, expiry: f.expiry, number: f.number, note: f.note, fileId, ...meta };
      const ok = commit((x) => (record ? editDocument(x, record.id, fields, actor) : addDocument(x, { owner, ...fields }, actor)), { label: record ? t('docs.updated') : t('docs.added') });
      if (ok) onClose();
    } finally { setBusy(false); }
  };
  const open = () => {
    if (!preview) return;
    const blob = dataUrlToBlob(preview);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'noopener');
    if (!w) { const a = Object.assign(document.createElement('a'), { href: url, download: record?.fileName || file?.name || 'document' }); a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const mime = file?.mime || record?.mime;
  return (
    <Sheet title={record ? f.title || t('docs.title') : t('docs.add')} onClose={onClose}
      footer={<div className="foot-btns">
        {record && <Button variant="danger" icon="trash" onClick={() => { if (commit((x) => removeDocument(x, record.id, actor), { label: t('deleted') })) onClose(); }}>{t('delete')}</Button>}
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy || (!f.title.trim() && !file)} onClick={save}>{t('save')}</Button>
      </div>}>
      <div className={`doc-drop ${preview ? 'has' : ''}`} onClick={() => !preview && input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }} role="button" tabIndex={0}>
        {preview && isImage(mime) ? <img src={preview} alt="" /> : preview ? <div className="doc-pdf"><Icon name="file" size={34} /><b>{file?.name || record?.fileName}</b><span className="muted small">{kb(file?.size || record?.size || 0)}</span></div>
          : <div className="doc-empty"><Icon name="upload" size={26} /><b>{t('docs.pick')}</b><span className="muted small">{t('docs.pickHint')}</span></div>}
        <input ref={input} type="file" hidden accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx" capture={undefined} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {preview && <div className="row-btns"><Button size="sm" icon="popout" onClick={open}>{t('docs.open')}</Button><Button size="sm" icon="upload" onClick={() => input.current?.click()}>{t('docs.replace')}</Button></div>}
      <div className="grid2">
        <Select label={t('docs.kind')} value={f.kind} onChange={(v) => set({ kind: v })} options={DOC_KINDS.map((k) => ({ value: k, label: t(`dk.${k}`) }))} />
        <TextInput label={t('docs.name')} value={f.title} onChange={(v) => set({ title: v })} />
        <TextInput label={`${t('docs.number')} (${t('optional')})`} value={f.number} onChange={(v) => set({ number: v })} />
        <DateInput label={t('docs.issued')} value={f.day} onChange={(v) => set({ day: v })} />
        <DateInput label={`${t('docs.expiry')} (${t('optional')})`} value={f.expiry} onChange={(v) => set({ expiry: v })} />
      </div>
      <TextArea label={t('note')} value={f.note} onChange={(v) => set({ note: v })} />
      {record && <p className="muted small">{t('docs.addedBy', { n: record.byName, d: dayLabel(record.at.slice(0, 10), lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>}
    </Sheet>
  );
}
