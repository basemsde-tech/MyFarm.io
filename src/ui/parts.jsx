// Selective backup: choose parts to save, and restore a part file without touching the rest of the farm.
import React, { useMemo, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Sheet, Check, Seg, Pill, dayLabel, TextInput } from './kit.jsx';
import { downloadText, PeriodBar, usePeriod } from './screens-money.jsx';
import { PART_KEYS, partCounts, partEnvelope, pickParts, restoreParts, partDiff, intersect } from '../core/partial.mjs';
import { backupEnvelope, normalise, cleanFileName } from '../core/backup.mjs';
import { compute } from '../core/ledger.mjs';
import { milkQ } from './units.js';
import { fmtQty } from '../core/money.mjs';

/** Singular wording when there is exactly one ("1 part", not "1 parts"). */
const pl = (t, k, n) => { const one = `${k}1`; const v = n === 1 ? t(one, { n }) : null; return v && v !== one ? v : t(k, { n }); };

export const PART_ICON = { animals: 'cow', sales: 'cart', suppliers: 'truck', expenses: 'receipt', production: 'milk', people: 'people', cash: 'cash', settings: 'gear' };

function PartPicker({ value, onChange, counts, only }) {
  const { t } = useApp();
  const keys = only || PART_KEYS;
  const all = keys.every((k) => value.includes(k));
  return (
    <div className="part-pick">
      <div className="part-pick-head">
        <span className="seg-label">{t('pt.choose')}</span>
        <button type="button" className="link small" onClick={() => onChange(all ? [] : [...keys])}>{all ? t('pt.none') : t('pt.all')}</button>
      </div>
      <div className="part-grid">
        {keys.map((k) => {
          const on = value.includes(k);
          const c = counts?.[k];
          return (
            <button type="button" key={k} role="checkbox" aria-checked={on} className={`part-opt ${on ? 'on' : ''}`} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}>
              <span className="part-ico"><Icon name={PART_ICON[k]} size={18} /></span>
              <span className="part-text">
                <b>{t(`pt.${k}`)}</b>
                <small>{t(`pt.${k}.sub`)}</small>
                {c && <small className="num part-n">{[c.rows ? pl(t, 'pt.rows', c.rows) : null, c.entries ? pl(t, 'pt.entries', c.entries) : null].filter(Boolean).join(' · ') || t('pt.empty')}</small>}
              </span>
              <span className="part-box"><Icon name="check" size={14} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Settings → Backup → "Choose what to save". */
export function PartBackupSheet({ onClose }) {
  const app = useApp();
  const { t, farm, files, today, toast, logEvent } = app;
  const [parts, setParts] = useState(['animals', 'sales', 'suppliers', 'expenses', 'production', 'people', 'cash']);
  const per = usePeriod('all');
  const range = per.p === 'all' ? null : per.range;
  const bad = range && range.from > range.to;
  const counts = useMemo(() => partCounts(farm, range), [farm, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = useMemo(() => pickParts(farm, parts, range), [farm, parts, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const refs = Object.entries(picked.refs || {}).filter(([, v]) => v.length);
  // The suggested name follows the choices until the user types their own.
  const autoName = `mazraati-${parts.length === PART_KEYS.length ? 'all-parts' : parts.join('-') || 'parts'}-${range ? `${range.from}_${range.to}` : `all-time-${today}`}`;
  const [typed, setTyped] = useState(null);
  const fname = typed ?? autoName;
  const save = async () => {
    const env = partEnvelope(farm, parts, new Date(), await files.collect(picked), range);
    const name = cleanFileName(fname, `${autoName}.json`);
    downloadText(name, JSON.stringify(env), 'application/json');
    logEvent('backupPart', { label: `${parts.join(', ')}${env.range ? ` · ${env.range.from} → ${env.range.to}` : ''}` });
    toast(t('bn.done', { f: `⁨${name}⁩` }), { sound: 'success' });
    onClose();
  };
  return (
    <Sheet title={t('pt.title')} sub={t('pt.sub')} onClose={onClose} wide
      footer={<div className="foot-btns"><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" icon="download" disabled={!parts.length || bad} onClick={save}>{pl(t, 'pt.save', parts.length)}</Button></div>}>
      <div className="field">
        <span className="seg-label">{t('pt.period')}</span>
        <PeriodBar value={per.p} onChange={per.onChange} range={per.range} setRange={per.setRange} options={['all', 'month', 'lastMonth', 'year', 'custom']} />
        <div className={`field-msg ${bad ? 'err' : ''}`}>{bad ? t('pt.badRange') : range ? t('pt.periodHint', { a: dayLabel(range.from, app.lang, { day: 'numeric', month: 'short', year: 'numeric' }), b: dayLabel(range.to, app.lang, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('pt.allHint')}</div>
      </div>
      <PartPicker value={parts} onChange={setParts} counts={counts} />
      {refs.length > 0 && <p className="muted small"><Icon name="file" size={14} /> {t('pt.refs', { l: refs.map(([l, v]) => `${v.length} ${t(`rs.c.${l}`)}`).join('، ') })}</p>}
      <div className="field bn-name">
        <TextInput label={t('bn.fileName')} value={fname} onChange={setTyped} spellCheck={false} />
        <div className="field-msg">{t('bn.nameHint', { f: cleanFileName(fname, `${autoName}.json`) })}{typed != null && typed !== autoName && <> · <button type="button" className="link small" onClick={() => setTyped(null)}>{t('bn.nameReset')}</button></>}</div>
      </div>
      <p className="muted small">{t('pt.hint')}</p>
    </Sheet>
  );
}

/** Inside the restore screen, when the chosen file holds only some parts. */
export function PartRestore({ env, fileName, fromSetup, onDone, onOther }) {
  const app = useApp();
  const { t, farm, fmt, lang, files, replaceFarm, setPrefs, toast, logEvent, today } = app;
  // A full backup starts with nothing ticked, so nothing is restored by accident; a part file starts with all its parts.
  const [parts, setParts] = useState(env.fromFull ? [] : env.parts);
  const [mode, setMode] = useState('add');
  const [keepCopy, setKeepCopy] = useState(true);
  const per = usePeriod('all');
  const pick = per.p === 'all' ? null : per.range;
  const range = intersect(env.range || null, pick);
  const badRange = !!(range && range.from > range.to);
  const hasData = farm.records.length > 0 || farm.customers.length > 0;
  const needsFarm = !farm.settings.setupDone && !parts.includes('settings');
  const counts = useMemo(() => partCounts(env.farm, range), [env, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => (parts.length && !badRange ? normalise(restoreParts(farm, env, { mode, parts, range: pick })) : farm), [farm, env, mode, parts, pick?.from, pick?.to, badRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const longD = (d) => dayLabel(d, lang, { day: 'numeric', month: 'short', year: 'numeric' });
  const diff = useMemo(() => partDiff(farm, next), [farm, next]);
  const a = useMemo(() => compute(farm), [farm]);
  const b = useMemo(() => compute(next), [next]);
  const rows = [
    ['rs.cashBox', fmt(a.cashC), fmt(b.cashC), a.cashC !== b.cashC],
    ['cash.owedToUs', fmt(a.receivableC), fmt(b.receivableC), a.receivableC !== b.receivableC],
    ['cash.weOwe', fmt(a.supplierDueC), fmt(b.supplierDueC), a.supplierDueC !== b.supplierDueC],
    ['prod.tank', milkQ(a.milk.stockL), milkQ(b.milk.stockL), Math.abs(a.milk.stockL - b.milk.stockL) > 0.0005],
    ['prod.eggStock', fmtQty(a.eggs.stock, 0), fmtQty(b.eggs.stock, 0), a.eggs.stock !== b.eggs.stock],
  ];
  const nothing = !Object.keys(diff).length;
  const go = async () => {
    if (hasData && keepCopy && !fromSetup) downloadText(`mazraati-before-restore-${today}.json`, JSON.stringify(backupEnvelope(farm, new Date(), await files.collect(farm))), 'application/json');
    if (env.files) await files.put(env.files);
    replaceFarm(next);
    logEvent('restorePart', { label: `${parts.join(', ')} · ${mode} · ${fileName}` });
    if (parts.includes('settings')) {
      const profiles = next.profiles || [];
      setPrefs({ profileId: profiles.length === 1 && !profiles[0].passHash ? profiles[0].id : app.prefs.profileId && profiles.some((p) => p.id === app.prefs.profileId) ? app.prefs.profileId : null });
    }
    toast(t('pt.done', { n: (diff.records?.added || 0) + (diff.records?.changed || 0) }), { sound: 'success' });
    onDone();
  };
  const total = (k) => Object.values(diff).reduce((s, d) => s + d[k], 0);
  return (
    <>
      <section className="restore-head">
        <div>
          <div className="restore-farm">{env.farm.settings?.farmName || t('brand')}</div>
          <div className="muted small">{pl(t, 'pt.fileOf', env.parts.length)}{env.range ? ` · ${t('pt.fileRange', { a: dayLabel(env.range.from, lang, { day: 'numeric', month: 'short', year: 'numeric' }), b: dayLabel(env.range.to, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}` : ''}{env.exportedAt && ` · ${t('rs.savedOn')} ${new Date(env.exportedAt).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB')}`}</div>
        </div>
        <Pill tone="info">{t('pt.partial')}</Pill>
      </section>
      <PartPicker value={parts} onChange={setParts} counts={counts} only={env.parts} />
      <Seg label={t('pt.how')} value={mode} onChange={setMode} options={[{ value: 'add', label: t('pt.add') }, { value: 'replace', label: t('pt.replace') }]} />
      <div className="field">
        <span className="seg-label">{t('pt.restorePeriod')}</span>
        <PeriodBar value={per.p} onChange={per.onChange} range={per.range} setRange={per.setRange} options={['all', 'month', 'lastMonth', 'year', 'custom']} />
        <div className={`field-msg ${badRange ? 'err' : ''}`}>{badRange ? t('pt.noOverlap') : range ? t('pt.periodRestore', { a: longD(range.from), b: longD(range.to) }) : t('pt.allRestore')}</div>
      </div>
      <p className="muted small">{t(mode === 'add' ? 'pt.addHint' : range ? 'pt.replaceRangeHint' : 'pt.replaceHint', range ? { a: longD(range.from), b: longD(range.to) } : undefined)}</p>
      {needsFarm ? <div className="note bad"><Icon name="alert" size={16} />{t('pt.needsFarm')}</div> : (
        <section className="restore-checks">
          <h3>{t('pt.willChange')}</h3>
          {nothing ? <p className="muted">{t('pt.nothing')}</p> : (
            <div className="restore-counts">
              <div className="rc"><b className="num">{total('added')}</b><span>{t('pt.added')}</span></div>
              <div className="rc"><b className="num">{total('changed')}</b><span>{t('pt.changed')}</span></div>
              {total('removed') > 0 && <div className="rc bad"><b className="num">{total('removed')}</b><span>{t('pt.removed')}</span></div>}
            </div>
          )}
          <table className="tbl pt-compare">
            <thead><tr><th /><th className="num">{t('pt.now')}</th><th className="num">{t('pt.after')}</th></tr></thead>
            <tbody>{rows.map(([k, x, y, ch]) => <tr key={k} className={ch ? 'pt-ch' : ''}><td>{t(k)}</td><td className="num">{x}</td><td className="num">{ch ? <b>{y}</b> : y}</td></tr>)}</tbody>
          </table>
          <p className="muted small">{t('pt.untouched')}</p>
        </section>
      )}
      <div className="foot-btns pt-foot">
        {hasData && !fromSetup && <Check label={t('rs.keepCopy')} checked={keepCopy} onChange={setKeepCopy} />}
        <Button onClick={onOther}>{t('rs.other')}</Button>
        <Button variant="primary" icon="upload" onClick={go} disabled={!parts.length || needsFarm || nothing || badRange}>{pl(t, 'pt.restore', parts.length)}</Button>
      </div>
    </>
  );
}
