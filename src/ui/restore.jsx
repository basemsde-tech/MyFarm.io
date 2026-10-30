import React, { useRef, useState } from 'react';
import { useApp } from './store.jsx';
import { Button, Icon, Pill, Sheet, Check } from './kit.jsx';
import { readBackup, backupEnvelope } from '../core/backup.mjs';
import { downloadText } from './screens-money.jsx';
import { compute } from '../core/ledger.mjs';

/** Pick a backup file, review exactly what will be restored and how balances compare, then replace the farm. */
export function RestoreSheet({ onClose, fromSetup }) {
  const { t, lang, farm, replaceFarm, setPrefs, toast, fmt, today, files, logEvent } = useApp();
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [keepCopy, setKeepCopy] = useState(true);
  const input = useRef(null);
  const hasData = farm.records.length > 0 || farm.customers.length > 0;

  const load = async (file) => {
    if (!file) return;
    setError(''); setRes(null); setBusy(true); setFileName(file.name);
    try {
      const text = await file.text();
      const r = readBackup(text, { lang });
      if (!r.ok) setError(t(`rs.${r.code === 'backup.notJson' ? 'notJson' : 'unknown'}`));
      else setRes(r);
    } catch {
      setError(t('rs.unreadable'));
    }
    setBusy(false);
  };

  const restore = async () => {
    if (!res) return;
    if (hasData && keepCopy && !fromSetup) downloadText(`mazraati-before-restore-${today}.json`, JSON.stringify(backupEnvelope(farm, new Date(), await files.collect(farm))), 'application/json');
    if (res.files) await files.put(res.files);
    replaceFarm(res.farm);
    logEvent('restore', { label: fileName });
    const profiles = res.farm.profiles || [];
    setPrefs({ profileId: profiles.length === 1 && !profiles[0].passHash ? profiles[0].id : null });
    toast(t('rs.done', { n: res.farm.records.length }));
    onClose();
  };

  const report = res?.report;
  const counts = report?.counts || (res ? {
    customers: res.farm.customers.length, suppliers: res.farm.suppliers.length, people: res.farm.people.length, animals: res.farm.animals.length,
    workers: res.farm.workers.length, records: res.farm.records.length,
  } : null);
  const failed = report ? report.checks.filter((c) => !c.ok) : [];
  const checkLabel = (c) => (c.key === 'cash' ? t('rs.cashBox') : c.key === 'capital' ? t('cash.capital') : c.name);
  const groupOf = (k) => ({ customer: 'rs.customers', supplier: 'rs.suppliers', person: 'rs.people' }[k] || 'rs.totals');
  const groups = report ? ['totals', 'customer', 'supplier', 'person'].map((g) => ({ g, rows: report.checks.filter((c) => (g === 'totals' ? ['cash', 'capital'].includes(c.key) : c.key === g)) })).filter((x) => x.rows.length) : [];
  const newSnap = res && !res.legacy ? compute(res.farm) : null;

  return (
    <Sheet title={t('rs.title')} sub={t('rs.sub')} onClose={onClose} wide
      footer={res ? (
        <div className="foot-btns">
          {hasData && !fromSetup && <Check label={t('rs.keepCopy')} checked={keepCopy} onChange={setKeepCopy} />}
          <Button onClick={() => { setRes(null); setFileName(''); }}>{t('rs.other')}</Button>
          <Button variant="primary" icon="upload" onClick={restore}>{t('rs.restore')}</Button>
        </div>
      ) : null}>
      {!res && (
        <label className={`drop ${drag ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files?.[0]); }}>
          <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="drop-ico"><Icon name="upload" size={26} /></span>
          <b>{busy ? t('rs.reading') : t('rs.pick')}</b>
          <span className="muted small">{t('rs.pickHint')}</span>
          {fileName && !busy && <span className="muted small">{fileName}</span>}
        </label>
      )}
      {error && <div className="note bad"><Icon name="alert" size={16} />{error}</div>}
      {res && (
        <>
          <section className="restore-head">
            <div>
              <div className="restore-farm">{res.farm.settings.farmName || t('brand')}</div>
              <div className="muted small">
                {res.legacy ? t('rs.fromOld') : t('rs.fromNew')}
                {report?.exportedAt && ` · ${t('rs.savedOn')} ${new Date(report.exportedAt).toLocaleString(lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB')}`}
              </div>
            </div>
            {res.legacy && (failed.length ? <Pill tone="warn">{t('rs.differ', { n: failed.length })}</Pill> : <Pill tone="good">{t('rs.allMatch')}</Pill>)}
          </section>
          <div className="restore-counts">
            {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
              <div key={k} className="rc"><b className="num">{v.toLocaleString('en-US')}</b><span>{t(`rs.c.${k}`)}</span></div>
            ))}
          </div>
          {res.legacy ? (
            <section className="restore-checks">
              <h3>{t('rs.checksTitle')}</h3>
              <p className="muted small">{t('rs.checksHint')}</p>
              {groups.map(({ g, rows }) => (
                <div key={g} className="rcheck-group">
                  <div className="rcheck-h">{t(groupOf(g))}</div>
                  <table className="tbl">
                    <thead><tr><th>{t('name')}</th><th className="num">{t('rs.oldApp')}</th><th className="num">{t('rs.newApp')}</th><th /></tr></thead>
                    <tbody>
                      {rows.map((c, i) => (
                        <tr key={i} className={c.ok ? '' : 'bad-row'}>
                          <td>{checkLabel(c)}{c.key === 'cash' && c.bankC ? <div className="muted small">{t('rs.cashSplit', { c: fmt(c.cashC), b: fmt(c.bankC) })}</div> : null}</td>
                          <td className="num">{fmt(c.oldC)}</td>
                          <td className="num">{fmt(c.newC)}</td>
                          <td className="rc-ok">{c.ok ? <Icon name="check" size={16} /> : <Icon name="alert" size={16} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {report.warnings.length > 0 && (
                <ul className="restore-notes">
                  {report.warnings.filter((w, i, a) => a.findIndex((x) => x.code === w.code) === i).map((w) => (
                    <li key={w.code}><Icon name="alert" size={14} />{t(`rs.w.${w.code}`, { b: w.bankC != null ? fmt(w.bankC) : '', n: report.warnings.filter((x) => x.code === w.code).length })}</li>
                  ))}
                </ul>
              )}
              {report.skipped > 0 && <p className="muted small">{t('rs.kept', { n: report.skipped })}</p>}
            </section>
          ) : (
            <section className="restore-checks">
              <h3>{t('rs.checksTitle')}</h3>
              <dl className="kv wide">
                <dt>{t('rs.cashBox')}</dt><dd className="num">{fmt(newSnap.cashC)}</dd>
                <dt>{t('cash.owedToUs')}</dt><dd className="num">{fmt(newSnap.receivableC)}</dd>
                <dt>{t('cash.weOwe')}</dt><dd className="num">{fmt(newSnap.supplierDueC)}</dd>
              </dl>
            </section>
          )}
          {hasData && !fromSetup && <div className="note warn"><Icon name="alert" size={16} />{t('rs.replaceWarn', { n: farm.settings.farmName || t('brand') })}</div>}
        </>
      )}
    </Sheet>
  );
}
