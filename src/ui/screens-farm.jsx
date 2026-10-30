import React, { useMemo, useRef, useState } from 'react';
import { useApp, KEYS, storage, readJSON, VERSION, MAX_BYTES } from './store.jsx';
import { Button, Icon, Pill, Empty, Stat, Tabs, Seg, Grouped, Select, TextInput, MoneyInput, QtyInput, Check, Field, monthLabel, dayLabel, Avatar, readImage, IconButton, FilterPanel } from './kit.jsx';
import { RecordRow, SelectionBar } from './tx.jsx';
import { PageHead, usePeriod, downloadText } from './screens-money.jsx';
import { live } from '../core/ledger.mjs';
import { SPECIES, statusesFor, reproTimeline, daysBetween } from '../core/species.mjs';
import { addRecord, editRecord, upsert, updateSettings, restoreRecords, purgeRecords, TRASH_DAYS, emptyFarm, newId } from '../core/commands.mjs';
import { periodReport, toCSV } from '../core/reports.mjs';
import { backupEnvelope, readBackup } from '../core/backup.mjs';
import { CURRENCIES, fmtQty } from '../core/money.mjs';
import { saleMilkL, milkLots } from '../core/milk.mjs';
import { ROLES, can, CATEGORY_ICON, EXPENSE_GROUPS } from '../core/catalog.mjs';
import { hashCode, newRecoveryCode, newSalt } from '../core/security.mjs';
import { sampleFarm } from '../core/sample.mjs';
import { setArchived, restoreMaster, MASTER_LISTS } from '../core/removal.mjs';
import { SoldRegister, SaleRecordPanel } from './sold.jsx';
import { BackupPanel, SecurityPanel, FarmsPanel, MessagingPanel } from './admin.jsx';
import { Attachments } from './documents.jsx';

/* ───────────── Production ───────────── */
export function ProductionScreen() {
  const { route, nav, t } = useApp();
  const tab = route.tab || 'milk';
  return (
    <div className="screen">
      <PageHead title={t('prod.title')} />
      <Tabs value={tab} onChange={(x) => nav('production', null, x)} tabs={[{ value: 'milk', label: t('prod.milk') }, { value: 'eggs', label: t('prod.eggs') }, { value: 'workers', label: t('prod.workers') }, { value: 'log', label: t('prod.log') }]} />
      {tab === 'milk' && <MilkTab />}
      {tab === 'eggs' && <EggsTab />}
      {tab === 'workers' && <WorkersTab />}
      {tab === 'log' && <ProdLog />}
    </div>
  );
}

function MilkTab() {
  const { farm, snap, t, ui, today, lang } = useApp();
  const recs = farm.records.filter(live);
  const soldToday = recs.filter((r) => r.type === 'sale' && r.day === today && !r.voided).reduce((s, r) => s + saleMilkL(r), 0);
  const usedToday = recs.filter((r) => r.type === 'milkUse' && r.day === today).reduce((s, r) => s + Number(r.liters), 0);
  const byDay = {};
  for (const r of recs) {
    if (r.type !== 'milk') continue;
    const d = (byDay[r.day] ||= { am: 0, pm: 0, day: 0, rows: [] });
    d.rows.push(r);
  }
  // Use the deduplicated lots for day totals so the table matches the tank.
  const lotsAll = useMemo(() => {
    const m = {};
    for (const r of recs) if (r.type === 'milk') (m[r.day] ||= []).push(r);
    return m;
  }, [farm.records]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = Object.keys(lotsAll).sort().reverse().slice(0, 21);
  const lots = milkLots(recs);
  const dayTotals = {};
  for (const l of lots) { const d = (dayTotals[l.day] ||= { am: 0, pm: 0, day: 0, total: 0 }); d[l.session] += l.liters; d.total += l.liters; }
  const producedToday = dayTotals[today]?.total || 0;
  return (
    <>
      <section className="stats-row">
        <Stat big label={t('prod.tank')} value={`${fmtQty(snap.milk.stockL)} ${t('u.L')}`} tone="teal" />
        <Stat label={`${t('prod.produced')} · ${t('today')}`} value={fmtQty(producedToday)} />
        <Stat label={`${t('prod.sold')} · ${t('today')}`} value={fmtQty(soldToday)} />
        <Stat label={`${t('prod.used')} · ${t('today')}`} value={fmtQty(usedToday)} />
      </section>
      <div className="quick">
        <Button variant="primary" icon="milk" onClick={() => ui.open('milk')}>{t('new.milk')}</Button>
        <Button icon="cart" onClick={() => ui.open('sale')}>{t('new.sale')}</Button>
        <Button onClick={() => ui.open('milkUse')}>{t('prod.use')}</Button>
      </div>
      {snap.milk.lots.length > 0 && (
        <section className="panel">
          <h2>{t('prod.lots')}</h2>
          <div className="lots">
            {[...snap.milk.lots].reverse().map((l) => (
              <div className="lot" key={l.key}>
                <div><b className="num">{fmtQty(l.left)} {t('u.L')}</b> <span className="muted">/ {fmtQty(l.liters)}</span></div>
                <div className="muted small">{dayLabel(l.day, lang)} · {t(`prod.${l.session}`)} · {t('fr.hours', { h: Math.round(l.hours) })}{l.by ? ` · ${l.by}` : ''}</div>
                <Pill status={l.fresh}>{t(`fr.${l.fresh}`)}</Pill>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <h2>{t('prod.milk')}</h2>
        {days.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t('date')}</th><th className="num">{t('prod.am')}</th><th className="num">{t('prod.pm')}</th><th className="num">{t('prod.dayTotal')}</th></tr></thead>
              <tbody>
                {days.map((d) => {
                  const x = dayTotals[d] || { am: 0, pm: 0, day: 0, total: 0 };
                  const bulk = (sess) => lotsAll[d].filter((r) => !r.animalId && r.session === sess).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                  const cell = (sess, v) => { const r = bulk(sess); return r ? <button type="button" className="cell-btn" onClick={() => ui.open('drawer', { id: r.id })} title={t('edit')}>{fmtQty(v)}</button> : v ? fmtQty(v) : '—'; };
                  return (
                    <tr key={d}>
                      <td>{dayLabel(d, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td className="num">{cell('am', x.am)}</td><td className="num">{x.day ? cell('day', x.day) : cell('pm', x.pm)}</td>
                      <td className="num"><b>{fmtQty(x.total)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title={t('prod.noMilk')} body={t('prod.noMilkHint')} icon="milk" action={<Button variant="primary" onClick={() => ui.open('milk')}>{t('new.milk')}</Button>} />}
      </section>
    </>
  );
}

function EggsTab() {
  const { farm, snap, t, ui, lang } = useApp();
  const flocks = farm.animals.filter((a) => a.species === 'chicken' && a.status !== 'sold');
  const rows = farm.records.filter((r) => live(r) && r.type === 'eggs').sort((a, b) => b.day.localeCompare(a.day));
  return (
    <>
      <section className="stats-row">
        <Stat big label={t('prod.eggStock')} value={fmtQty(snap.eggs.stock, 0)} tone="teal" />
        <Stat label={t('prod.collected')} value={fmtQty(snap.eggs.collected, 0)} />
        <Stat label={t('prod.broken')} value={fmtQty(snap.eggs.broken, 0)} />
        <Stat label={t('prod.sold')} value={fmtQty(snap.eggs.sold, 0)} />
      </section>
      <div className="quick"><Button variant="primary" icon="egg" onClick={() => ui.open('eggs')} disabled={!flocks.length}>{t('new.eggs')}</Button></div>
      <section className="panel">
        {!flocks.length ? <Empty title={t('prod.noFlock')} icon="egg" action={<Button onClick={() => ui.open('animal', { species: 'chicken' })}>{t('ani.new')}</Button>} />
          : rows.length ? <Grouped rows={rows} groupKey={(r) => r.day.slice(0, 7)} renderGroup={(g) => <><span>{monthLabel(g.key, lang)}</span><span className="num muted">{g.rows.reduce((s, r) => s + r.count - (r.broken || 0), 0)}</span></>} renderRow={(r) => <RecordRow key={r.id} r={r} onOpen={() => ui.open('drawer', { id: r.id })} />} />
            : <Empty title={t('prod.eggs')} icon="egg" />}
      </section>
    </>
  );
}

function WorkersTab() {
  const { farm, t, ui, today, fmt, commit, actor } = useApp();
  const workers = farm.workers.filter((w) => !w.archived);
  const att = (w) => farm.records.find((r) => live(r) && r.type === 'attendance' && r.workerId === w.id && r.day === today);
  const toggle = (w, present) => {
    const a = att(w);
    commit((f) => (a ? editRecord(f, a.id, { present }, actor, 'attendance') : addRecord(f, { type: 'attendance', day: today, workerId: w.id, present }, actor)), { silent: true });
  };
  const daily = workers.filter((w) => w.pay === 'daily');
  const presentDaily = daily.filter((w) => att(w)?.present);
  const wagesC = presentDaily.reduce((s, w) => s + (w.wageC || 0), 0);
  const paidToday = farm.records.some((r) => live(r) && r.type === 'expense' && r.category === 'labour' && r.day === today && r.payroll);
  return (
    <>
      <div className="quick">
        <Button icon="plus" onClick={() => ui.open('worker')}>{t('wk.new')}</Button>
        {daily.length > 0 && <Button variant="primary" disabled={!wagesC || paidToday} onClick={() => ui.open('expense', { category: 'labour', amountC: wagesC, payroll: true })}>{t('wk.payToday')} · {fmt(wagesC)}</Button>}
      </div>
      {daily.length > 0 && <div className="note info"><Icon name="alert" size={16} />{t('wk.todayPay')}: <b className="num">{fmt(wagesC)}</b> · {t('exp.auto')}</div>}
      <section className="panel">
        {workers.length ? workers.map((w) => {
          const a = att(w);
          return (
            <div className="row" key={w.id}>
              <button type="button" className="row-main" onClick={() => ui.open('worker', { record: w })}>
                <span className="row-ico"><Icon name="user" /></span>
                <span className="row-text"><span className="row-title">{w.name}</span><span className="row-sub">{t(`wk.${w.pay}`)} · {fmt(w.wageC || 0)}</span></span>
              </button>
              {w.pay === 'daily'
                ? <Seg small value={a ? (a.present ? 'p' : 'a') : ''} onChange={(v) => toggle(w, v === 'p')} options={[{ value: 'p', label: t('wk.present') }, { value: 'a', label: t('wk.absent') }]} />
                : <Button size="sm" onClick={() => ui.open('expense', { category: 'labour', amountC: w.wageC, workerId: w.id })}>{t('wk.payMonth')}</Button>}
            </div>
          );
        }) : <Empty title={t('wk.title')} body={t('wk.none')} icon="user" action={<Button variant="primary" onClick={() => ui.open('worker')}>{t('wk.new')}</Button>} />}
      </section>
    </>
  );
}

function ProdLog() {
  const { farm, t, ui, lang } = useApp();
  const [type, setType] = useState('');
  const [sel, setSel] = useState([]);
  const types = ['milk', 'milkUse', 'eggs', 'medicine', 'animalEvent'];
  const rows = farm.records.filter((r) => live(r) && types.includes(r.type) && (!type || r.type === type)).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="panel">
      <FilterPanel id="prodlog" onReset={() => setType('')} chips={[type && { label: t(`t.${type}`), active: true }]}>
        <Seg small wrap label={t('flt.kind')} value={type} onChange={setType} options={[{ value: '', label: t('all') }, ...types.map((x) => ({ value: x, label: t(`t.${x}`) }))]} />
      </FilterPanel>
      {rows.length ? <Grouped rows={rows} groupKey={(r) => r.day.slice(0, 7)} renderGroup={(g) => <><span>{monthLabel(g.key, lang)}</span><span className="muted num">{g.rows.length}</span></>}
        renderRow={(r) => <RecordRow key={r.id} r={r} onOpen={() => ui.open('drawer', { id: r.id })} selectable selected={sel.includes(r.id)} onSelect={(on) => setSel(on ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />} />
        : <Empty title={t('prod.noMilk')} icon="milk" />}
      <SelectionBar selected={sel} clear={() => setSel([])} />
    </section>
  );
}

/* ───────────── Animals ───────────── */
export function AnimalsScreen() {
  const { route } = useApp();
  return route.id ? <AnimalDetail id={route.id} /> : <AnimalList />;
}

function AnimalList() {
  const { farm, t, ui, nav, today, lang, route } = useApp();
  const tab = route.tab === 'sold' ? 'sold' : 'herd';
  const soldCount = farm.animals.filter((a) => !a.deletedAt && a.status === 'sold').length;
  const [sp, setSp] = useState('');
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [arch, setArch] = useState(false);
  const [sort, setSort] = useState('tag');
  const { commit, actor } = useApp();
  const gone = farm.animals.filter((a) => !a.archived && a.status === 'dead');
  const list = farm.animals.filter((a) => a.status !== 'sold' && !!a.archived === arch && (!sp || a.species === sp) && (!st || a.status === st) && (!q || `${a.tag} ${a.name} ${a.breed}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (['sold', 'dead'].includes(a.status) ? 1 : 0) - (['sold', 'dead'].includes(b.status) ? 1 : 0)
      || (sort === 'name' ? (a.name || a.tag).localeCompare(b.name || b.tag)
        : sort === 'due' ? ((a.repro?.serviceDay ? reproTimeline(a.species, a.repro.serviceDay, today, a.repro.check)?.due : '9999') || '9999').localeCompare((b.repro?.serviceDay ? reproTimeline(b.species, b.repro.serviceDay, today, b.repro.check)?.due : '9999') || '9999')
        : 0)
      || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const counts = Object.keys(SPECIES).map((s) => [s, farm.animals.filter((a) => a.species === s && !['sold', 'dead'].includes(a.status)).reduce((n, a) => n + (SPECIES[s].mode === 'flock' ? (a.birds || 0) : 1), 0)]).filter(([, n]) => n);
  return (
    <div className="screen">
      <PageHead title={t('ani.title')} sub={counts.map(([s, n]) => `${t(`sp.${s}`)} ${n}`).join(' · ')} actions={<>
        {gone.length > 0 && <Button icon="archive" onClick={() => commit((f) => gone.reduce((x, a) => setArchived(x, 'animals', a.id, true, actor), f), { label: t('archived') })}>{t('ani.archiveSold', { n: gone.length })}</Button>}
        <Button variant="primary" icon="plus" onClick={() => ui.open('animal', { species: sp || undefined })}>{t('ani.new')}</Button>
      </>} />
      <Tabs value={tab} onChange={(x) => nav('animals', null, x === 'herd' ? null : x)} tabs={[{ value: 'herd', label: t('ani.herd') }, { value: 'sold', label: t('sold.tab'), count: soldCount }]} />
      {tab === 'sold' ? <SoldRegister /> : (
      <section className="panel">
        <FilterPanel id="animals" onReset={() => { setQ(''); setSp(''); setSt(''); setArch(false); setSort('tag'); }}
          chips={[sp && { label: t(`sp.${sp}`), active: true }, st && { label: t(`as.${st}`), active: true }, q && { label: `“${q}”`, active: true }, arch && { label: t('archived'), active: true }, { label: t(`flt.sort.${sort}`), active: sort !== 'tag' }]}>
          <div className="filter-row">
            <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} />
            <Seg small label={t('prod.species')} value={sp} onChange={(v) => { setSp(v); setSt(''); }} options={[{ value: '', label: t('all') }, ...Object.keys(SPECIES).map((s) => ({ value: s, label: t(`sp.${s}`) }))]} />
            <Select className="compact" label={t('ani.status')} value={st} onChange={setSt} options={[...new Set(farm.animals.map((a) => a.status))].filter((s) => s !== 'sold').map((s) => ({ value: s, label: t(`as.${s}`) }))} placeholder={t('all')} />
            <Seg small label={t('flt.sortBy')} value={sort} onChange={setSort} options={['tag', 'name', 'due'].map((k) => ({ value: k, label: t(`flt.sort.${k === 'due' ? 'birth' : k}`) }))} />
            <label className="mini-check"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> {t('showArchived')} ({farm.animals.filter((x) => x.archived).length})</label>
          </div>
        </FilterPanel>
        {list.length ? (
          <div className="animal-grid">
            {list.map((a) => {
              const tl = a.repro?.serviceDay ? reproTimeline(a.species, a.repro.serviceDay, today, a.repro.check) : null;
              const next = tl && !tl.failed ? tl.steps.find((s) => s.key === tl.next) : null;
              return (
                <button type="button" key={a.id} className={`animal-card sp-${a.species} ${['sold', 'dead'].includes(a.status) ? 'gone' : ''}`} onClick={() => nav('animals', a.id)}>
                  <span className="ac-photo">{a.photo ? <img src={a.photo} alt="" /> : <Icon name={a.species === 'chicken' ? 'egg' : 'cow'} size={26} />}</span>
                  <span className="ac-body">
                    <span className="ac-tag num">{a.tag}</span>
                    <span className="ac-name">{a.name || a.breed || t(`sp.${a.species}`)}{SPECIES[a.species].mode === 'flock' ? ` · ${a.birds || 0}` : ''}</span>
                    <span className="ac-meta"><Pill status={a.status}>{t(`as.${a.status}`)}</Pill>{next && <span className="muted small">{t(`step.${next.key}`)} · {dayLabel(next.day, lang, { day: 'numeric', month: 'short' })}</span>}{tl?.overdue && <Pill tone="bad">{t('ani.overdue')}</Pill>}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : <Empty title={t('ani.none')} body={t('ani.noneHint')} icon="cow" action={<Button variant="primary" icon="plus" onClick={() => ui.open('animal')}>{t('ani.new')}</Button>} />}
      </section>
      )}
    </div>
  );
}

function AnimalDetail({ id }) {
  const { farm, t, ui, nav, today, lang, fmt, commit, actor } = useApp();
  const a = farm.animals.find((x) => x.id === id);
  if (!a) return <Empty title={t('e.notFound')} />;
  const sp = SPECIES[a.species];
  const flock = sp.mode === 'flock';
  const tl = a.repro?.serviceDay ? reproTimeline(a.species, a.repro.serviceDay, today, a.repro.check) : null;
  const events = farm.records.filter((r) => live(r) && (r.animalId === a.id || r.flockId === a.id)).sort((x, y) => y.day.localeCompare(x.day));
  const ev = (kind) => ui.open('animalEvent', { animalId: a.id, kind });
  return (
    <div className="screen">
      <PageHead back={() => nav('animals')} title={a.name ? `${a.name} · ${a.tag}` : a.tag} sub={[t(`sp.${a.species}`), a.breed, a.dob && a.status !== 'sold' && `${daysBetween(a.dob, today)} ${t('u.unit') && (lang === 'ar' ? 'يوم' : 'days')}`].filter(Boolean).join(' · ')}
        actions={<>
          <Button icon="archive" onClick={() => commit((f) => setArchived(f, 'animals', a.id, !a.archived, actor), { label: a.archived ? t('unarchive') : t('archived') })}>{a.archived ? t('unarchive') : t('ani.archive')}</Button>
          {a.status !== 'sold' && <Button icon="trash" variant="danger" onClick={() => ui.open('deleteMaster', { list: 'animals', id: a.id, onDone: (m) => m !== 'archive' && nav('animals') })}>{t('ani.delete')}</Button>}
          <Button icon="edit" onClick={() => ui.open('animal', { record: a })}>{t('edit')}</Button>
        </>} />
      {a.archived && <div className="note info"><Icon name="archive" size={16} />{t('ani.archivedNote')}</div>}
      <section className={`animal-hero sp-${a.species}`}>
        <span className="ah-photo">{a.photo ? <img src={a.photo} alt="" /> : <Icon name={flock ? 'egg' : 'cow'} size={40} />}</span>
        <div className="ah-facts">
          <Pill status={a.status}>{t(`as.${a.status}`)}</Pill>
          <dl className="kv">
            {flock ? <><dt>{t('ani.birds')}</dt><dd className="num">{a.birds || 0}</dd>{a.coop && <><dt>{t('ani.coop')}</dt><dd>{a.coop}</dd></>}</> : <>
              {a.weight > 0 && <><dt>{t('ani.weight')}</dt><dd className="num">{fmtQty(a.weight)}</dd></>}
              <dt>{t('ani.parity')}</dt><dd className="num">{a.parity || 0}</dd>
              {a.yieldL > 0 && <><dt>{t('ani.yield')}</dt><dd className="num">{fmtQty(a.yieldL)} {t('u.L')}</dd></>}
            </>}
            <dt>{t('ani.source')}</dt><dd>{a.source === 'bought' ? `${t('ani.bought')}${a.priceC ? ` · ${fmt(a.priceC)}` : ''}` : t('ani.born')}</dd>
            {a.medicine && <><dt>{t('ani.medicine')}</dt><dd>{a.medicine}</dd></>}
          </dl>
          {a.notes && <p className="muted">{a.notes}</p>}
        </div>
      </section>
      {a.status === 'sold' && <SaleRecordPanel a={a} />}
      {a.status !== 'sold' && <div className="quick">
        {sp.product === 'milk' && <Button icon="milk" onClick={() => ui.open('milk')}>{t('new.milk')}</Button>}
        {flock && <Button icon="egg" onClick={() => ui.open('eggs')}>{t('new.eggs')}</Button>}
        <Button onClick={() => ui.open('medicine', { animalId: a.id })}>{t('t.medicine')}</Button>
        {!flock && <Button onClick={() => ev('weight')}>{t('ani.logWeight')}</Button>}
        <Button onClick={() => ev('loss')}>{t('ani.logLoss')}</Button>
        {a.status !== 'dead' && <Button icon="cart" onClick={() => ui.open('sale', { animalId: a.id })}>{t('sold.sellAnimal')}</Button>}
      </div>}
      {!flock && a.status !== 'sold' && (
        <section className="panel">
          <div className="panel-head"><h2>{t('ani.repro')}</h2><Button size="sm" variant={tl ? 'quiet' : 'primary'} onClick={() => ev('service')}>{t('ani.service')}</Button></div>
          {tl ? (
            <>
              <ol className="timeline">
                {tl.steps.map((s) => (
                  <li key={s.key} className={`${s.done ? 'done' : ''} ${tl.next === s.key ? 'next' : ''}`}>
                    <span className="tl-dot" />
                    <div><b>{t(`step.${s.key}`)}</b><div className="muted small num">{dayLabel(s.day, lang, { day: 'numeric', month: 'short', year: 'numeric' })}{s.to ? ` – ${dayLabel(s.to, lang)}` : ''}</div></div>
                    {tl.next === s.key && s.key === 'pregCheck' && <Button size="sm" onClick={() => ev('check')}>{t('ani.check')}</Button>}
                    {tl.next === s.key && s.key === 'dryOff' && <Button size="sm" onClick={() => ev('dry')}>{t('ani.dryNow')}</Button>}
                    {(s.key === 'birth' && (tl.next === 'birth' || tl.next === 'dryOff')) && <Button size="sm" variant="primary" onClick={() => ev('birth')}>{t('ani.recordBirth')}</Button>}
                  </li>
                ))}
              </ol>
              {tl.failed && <div className="note warn">{t('ani.checkOpen')}</div>}
              {tl.overdue && <div className="note bad">{t('ani.overdue')}</div>}
              <div className="muted small">{t('ani.daysSince', { n: tl.since })} · {t('ani.dueDate')} {dayLabel(tl.due, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </>
          ) : <p className="muted">{t('ani.service')} → {t('step.pregCheck')} → {t('step.dryOff')} → {t('step.birth')} ({sp.gestation} {lang === 'ar' ? 'يوم' : 'days'})</p>}
        </section>
      )}
      <section className="panel">
        <h2>{t('ani.events')}</h2>
        {events.length ? events.map((r) => <RecordRow key={r.id} r={r} onOpen={() => ui.open('drawer', { id: r.id })} />) : <p className="muted">—</p>}
      </section>
      <Attachments list="animals" id={a.id} />
    </div>
  );
}

/* ───────────── Reports ───────────── */
export function ReportsScreen() {
  const app = useApp();
  const { farm, t, fmt, lang } = app;
  const per = usePeriod('month');
  const rep = useMemo(() => periodReport(farm, per.range.from, per.range.to), [farm, per.range]);
  const maxCat = Math.max(1, ...Object.values(rep.byCategory));
  const exportProd = () => {
    const rows = farm.records.filter((r) => live(r) && ['milk', 'eggs', 'milkUse'].includes(r.type) && r.day >= per.range.from && r.day <= per.range.to).sort((a, b) => a.day.localeCompare(b.day));
    downloadText(`production-${per.range.from}.csv`, toCSV([[t('date'), t('when'), t('ani.title'), t('sale.product'), t('qty'), t('unit'), t('by')],
      ...rows.map((r) => [r.day, r.createdAt.slice(11, 16), r.animalId ? app.names.animal(r.animalId) : r.flockId ? app.names.animal(r.flockId) : t('prod.herdMode'), t(`t.${r.type}`) + (r.session ? ` ${t(`prod.${r.session}`)}` : ''), r.liters ?? r.count, r.type === 'eggs' ? t('u.egg') : t('u.L'), r.createdByName])]));
  };
  const exportSales = () => {
    const rows = farm.records.filter((r) => live(r) && r.type === 'sale' && !r.voided && r.day >= per.range.from && r.day <= per.range.to);
    downloadText(`sales-${per.range.from}.csv`, toCSV([[t('date'), t('sale.customer'), t('items'), t('total'), t('sale.payNow'), t('by')], ...rows.map((r) => [r.day, app.names.customer(r.customerId), r.lines.map((l) => `${t(`pr.${l.product}`)} ${l.qty}`).join(' + '), r.totalC / 100, (r.paidNowC || 0) / 100, r.createdByName])]));
  };
  const exportExp = () => downloadText(`expenses-${per.range.from}.csv`, toCSV([[t('date'), t('exp.item'), t('amount'), t('exp.paid'), t('exp.supplier')], ...app.snap.expenses.filter((e) => e.day >= per.range.from && e.day <= per.range.to).map((e) => [e.day, t(`c.${e.category}`), e.amountC / 100, e.paidC / 100, e.supplierId ? app.names.supplier(e.supplierId) : ''])]));
  return (
    <div className="screen">
      <PageHead title={t('rep.title')} />
      <FilterPanel id="reports" onReset={per.reset} chips={[{ label: per.label, active: !per.isDefault }]}>
        <Seg small wrap value={per.p} onChange={per.onChange} options={['week', 'month', 'lastMonth', 'year', 'all'].map((p) => ({ value: p, label: t(`p.${p}`) }))} />
      </FilterPanel>
      <section className="stats-row">
        <Stat label={t('rep.sales')} value={fmt(rep.salesC)} sub={rep.walkinC ? `${t('rep.walkin')} ${fmt(rep.walkinC)}` : null} />
        <Stat label={t('rep.expenses')} value={fmt(rep.expenseC)} />
        <Stat label={t('rep.profit')} value={fmt(rep.profitC)} sub={t('rep.profitHint')} tone={rep.profitC >= 0 ? 'in' : 'out'} />
        <Stat label={t('rep.production')} value={`${fmtQty(rep.milkL)} ${t('u.L')}`} sub={rep.eggs ? `${fmtQty(rep.eggs, 0)} ${t('rep.eggsN')}` : `${t('prod.sold')} ${fmtQty(rep.milkSoldL)}`} />
      </section>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h2>{t('rep.byProduct')}</h2><Button size="sm" icon="download" onClick={exportSales}>{t('rep.csv')}</Button></div>
          {Object.keys(rep.byProduct).length ? (
            <table className="tbl"><tbody>{Object.entries(rep.byProduct).map(([p, v]) => <tr key={p}><td>{t(`pr.${p}`)}</td><td className="num">{fmtQty(v.qty)} {t(`u.${p === 'milk' ? 'L' : p === 'eggs' ? 'egg' : p === 'animal' ? 'head' : 'kg'}`)}</td><td className="num"><b>{fmt(v.amountC)}</b></td></tr>)}</tbody></table>
          ) : <p className="muted">{t('sales.noSales')}</p>}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>{t('rep.cash')}</h2></div>
          <dl className="kv wide">
            <dt>{t('cash.opening')}</dt><dd className="num">{fmt(rep.cash.openingC)}</dd>
            <dt>{t('in')}</dt><dd className="num in">+{fmt(rep.cash.inC)}</dd>
            <dt>{t('out')}</dt><dd className="num out">−{fmt(rep.cash.outC).replace('−', '')}</dd>
            <dt><b>{t('cash.closing')}</b></dt><dd className="num"><b>{fmt(rep.cash.closingC)}</b></dd>
            <dt>{t('rep.receivable')}</dt><dd className="num">{fmt(rep.receivableC)}</dd>
            <dt>{t('rep.payable')}</dt><dd className="num">{fmt(rep.supplierDueC)}</dd>
          </dl>
        </section>
      </div>
      <section className="panel bars">
        <div className="panel-head"><h2>{t('rep.byCategory')}</h2><Button size="sm" icon="download" onClick={exportExp}>{t('rep.csv')}</Button></div>
        {Object.entries(rep.byCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
          <div className="bar-row" key={c}><span className="bar-label">{CATEGORY_ICON[c] || '•'} {t(`c.${c}`)}</span><span className="bar-track"><span className="bar-fill" style={{ inlineSize: `${(v / maxCat) * 100}%` }} /></span><span className="num">{fmt(v)}</span></div>
        ))}
        {!Object.keys(rep.byCategory).length && <p className="muted">{t('exp.none')}</p>}
      </section>
      <div className="quick"><Button icon="download" onClick={exportProd}>{t('rep.production')} · {t('rep.csv')}</Button></div>
    </div>
  );
}

/* ───────────── Recently deleted ───────────── */
export function TrashScreen() {
  const { farm, rawFarm, t, ui, commit, actor, lang } = useApp();
  const [sel, setSel] = useState([]);
  const rows = farm.records.filter((r) => r.deletedAt && r.deleteReason !== 'replaced').sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const left = (d) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
  const masters = MASTER_LISTS.flatMap((list) => (rawFarm[list] || []).filter((x) => x.deletedAt).map((x) => ({ list, x, n: rawFarm.records.filter((r) => r.deleteBatch && r.deleteBatch === x.deleteBatch).length })))
    .sort((a, b) => b.x.deletedAt.localeCompare(a.x.deletedAt));
  const masterIcon = { customers: 'user', suppliers: 'truck', people: 'people', animals: 'cow', workers: 'user', obligations: 'calendar' };
  const batchIds = new Set(masters.map((m) => m.x.deleteBatch));
  const loose = rows.filter((r) => !r.deleteBatch || !batchIds.has(r.deleteBatch));
  return (
    <div className="screen">
      <PageHead title={t('trash.title')} sub={t('trash.hint')} actions={sel.length > 0 && <>
        <Button icon="undo" onClick={() => { commit((f) => restoreRecords(f, sel, actor), { label: t('restored') }); setSel([]); }}>{t('restore')} ({sel.length})</Button>
        {can(actor?.role, 'purge') && <Button variant="danger" onClick={() => ui.open('purge', { ids: sel })}>{t('ed.purge')}</Button>}
      </>} />
      {masters.length > 0 && (
        <section className="panel">
          <h2>{t('trash.masters')}</h2>
          {masters.map(({ list, x, n }) => (
            <div className="row" key={list + x.id}>
              <div className="row-main static">
                <span className="row-ico"><Icon name={masterIcon[list]} /></span>
                <span className="row-text"><span className="row-title">{x.name || x.tag || x.party}</span><span className="row-sub">{t(`nav.${list === 'obligations' ? 'expenses' : list === 'workers' ? 'production' : list === 'customers' ? 'sales' : list}`)}{n ? ` · ${t('trash.withN', { n })}` : ''} · {t('trash.deletedBy', { n: x.deletedByName })} · {t('trash.left', { n: left(x.deletedAt) })}</span></span>
              </div>
              <Button size="sm" icon="undo" onClick={() => commit((f) => restoreMaster(f, list, x.id, actor), { label: t('restored') })}>{t('restore')}</Button>
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        {masters.length > 0 && <h2>{t('trash.records')}</h2>}
        {loose.length ? loose.map((r) => (
          <RecordRow key={r.id} r={r} onOpen={() => ui.open('drawer', { id: r.id })} selectable selected={sel.includes(r.id)} onSelect={(on) => setSel(on ? [...sel, r.id] : sel.filter((x) => x !== r.id))}
            right={<span className="amt-stack"><Button size="sm" icon="undo" onClick={(e) => { e.stopPropagation(); commit((f) => restoreRecords(f, [r.id], actor), { label: t('restored') }); }}>{t('restore')}</Button><small className="muted">{t('trash.deletedBy', { n: r.deletedByName })} · {t('trash.left', { n: left(r.deletedAt) })}</small></span>} />
        )) : !masters.length && <Empty title={t('trash.none')} icon="trash" />}
      </section>
    </div>
  );
}

/* ───────────── Settings ───────────── */
export function SettingsScreen() {
  const app = useApp();
  const { farm, t, commit, actor, ui, prefs, setPrefs, replaceFarm, toast, demo, today } = app;
  const s = farm.settings;
  const set = (patch) => commit((f) => updateSettings(f, patch), { silent: true, undoable: false });
  const [recovery, setRecovery] = useState(null);
  const canSet = can(actor?.role, 'settings');
  const lastMonthEnd = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const makeRecovery = async () => {
    const code = newRecoveryCode();
    const salt = s.salt || newSalt();
    const hash = await hashCode(code, salt);
    commit((f) => ({ ...updateSettings(f, { salt }), recovery: hash }), { silent: true, undoable: false });
    setRecovery(code);
  };
  return (
    <div className="screen settings">
      <PageHead title={t('set.title')} />
      <fieldset className="panel" disabled={!canSet}>
        <h2>{t('set.farm')}</h2>
        <div className="grid2">
          <TextInput label={t('set.farmName')} value={s.farmName} onChange={(v) => set({ farmName: v })} />
          <TextInput label={t('phone')} value={s.farmPhone} onChange={(v) => set({ farmPhone: v })} />
          <TextInput label={t('set.address')} value={s.farmAddress} onChange={(v) => set({ farmAddress: v })} />
          <TextInput label={t('set.email')} value={s.farmEmail} onChange={(v) => set({ farmEmail: v })} />
        </div>
        <Field label={t('set.logo')}>
          <div className="receipt-row">
            {s.logo && <img src={s.logo} alt="" className="thumb" />}
            <label className="btn btn-quiet btn-sm"><Icon name="upload" size={16} /><span>{t('exp.addReceipt')}</span><input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ logo: await readImage(f, 240, 0.8) }); }} /></label>
          </div>
        </Field>
      </fieldset>
      <fieldset className="panel" disabled={!canSet}>
        <h2>{t('set.money')}</h2>
        <div className="grid3">
          <Select label={t('set.currency')} value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <Select label={t('set.second')} value={s.second?.code} onChange={(v) => set({ second: { ...s.second, code: v } })} options={CURRENCIES.filter((c) => c !== s.currency).map((c) => ({ value: c, label: c }))} />
          <QtyInput label={t('set.rate')} hint={t('set.rateHint', { c: s.second?.code, b: s.currency })} value={s.second?.rate} onValue={(v) => set({ second: { ...s.second, rate: v } })} />
        </div>
        <div className="grid3">
          <MoneyInput label={t('set.milkPrice')} cents={s.milkPriceC} onCents={(c) => set({ milkPriceC: c })} />
          <MoneyInput label={t('set.eggPrice')} cents={s.eggPriceC} onCents={(c) => set({ eggPriceC: c })} />
          <MoneyInput label={t('set.wage')} cents={s.wageC} onCents={(c) => set({ wageC: c })} />
        </div>
        <div className="grid3">
          <QtyInput label={t('set.terms')} value={s.termsDays} onValue={(v) => set({ termsDays: Math.round(v) })} />
          <Seg label={t('set.milkMode')} value={s.milkMode} onChange={(v) => set({ milkMode: v })} options={[{ value: 'herd', label: t('prod.herdMode') }, { value: 'animal', label: t('prod.animalMode') }]} />
          <Seg label={t('set.milkUnit')} value={s.milkUnit} onChange={(v) => set({ milkUnit: v })} options={[{ value: 'L', label: t('u.L') }, { value: 'kg', label: t('u.kg') }]} />
        </div>
      </fieldset>
      <fieldset className="panel" disabled={!canSet}>
        <h2>{t('set.tax')}</h2>
        <Check label={t('set.taxOn')} checked={s.tax.enabled} onChange={(v) => set({ tax: { ...s.tax, enabled: v } })} />
        {s.tax.enabled && (
          <div className="grid3">
            <QtyInput label={t('set.taxRate')} value={s.tax.rate} onValue={(v) => set({ tax: { ...s.tax, rate: Math.min(100, v) } })} unit="%" />
            <TextInput label={t('set.taxNumber')} value={s.tax.number} onChange={(v) => set({ tax: { ...s.tax, number: v } })} />
            <TextInput label={t('set.taxReg')} value={s.tax.registration} onChange={(v) => set({ tax: { ...s.tax, registration: v } })} />
            <Check label={t('set.taxIncl')} checked={s.tax.inclusive} onChange={(v) => set({ tax: { ...s.tax, inclusive: v } })} />
          </div>
        )}
        <h2>{t('set.docs')}</h2>
        <div className="grid3">
          <TextInput label={t('set.prefix')} value={s.doc.prefix} onChange={(v) => set({ doc: { ...s.doc, prefix: v } })} />
          <TextInput label={t('set.rctPrefix')} value={s.doc.rctPrefix ?? 'RCT-'} onChange={(v) => set({ doc: { ...s.doc, rctPrefix: v } })} />
          <TextInput label={t('set.poPrefix')} value={s.doc.poPrefix ?? 'PO-'} onChange={(v) => set({ doc: { ...s.doc, poPrefix: v } })} />
          <TextInput label={t('set.thanks')} value={s.doc.thanks} onChange={(v) => set({ doc: { ...s.doc, thanks: v } })} />
          <TextInput label={t('set.footer')} value={s.doc.footer} onChange={(v) => set({ doc: { ...s.doc, footer: v } })} />
        </div>
        <Check label={t('set.signatures')} checked={s.doc.signatures} onChange={(v) => set({ doc: { ...s.doc, signatures: v } })} />
      </fieldset>
      <section className="panel">
        <div className="panel-head"><h2>{t('set.team')}</h2>{canSet && <Button size="sm" icon="plus" onClick={() => ui.open('profile')}>{t('set.addProfile')}</Button>}</div>
        <div className="team-grid">
          {farm.profiles.map((p) => (
            <button type="button" key={p.id} className="team-card" onClick={() => canSet && ui.open('profile', { record: p })} disabled={!canSet}>
              <Avatar p={p} size={44} />
              <span className="team-text">
                <b>{p.name}{p.id === actor?.id && <span className="you">{t('pf.you')}</span>}</b>
                <span>{t(`role.${p.role}`)}</span>
              </span>
              <span className={`team-lock ${p.passHash ? 'on' : ''}`} title={p.passHash ? t('pf.locked') : t('pf.noCode')}><Icon name="lock" size={14} />{p.passHash ? t('pf.codeOn') : t('pf.codeOff')}</span>
            </button>
          ))}
        </div>
        {canSet && (
          <div className="sub-sec">
            <h3>{t('set.recovery')}</h3>
            {recovery ? <div className="recovery num">{recovery}</div> : <Button size="sm" onClick={makeRecovery}>{t('set.newRecovery')}</Button>}
            {recovery && <p className="muted small">{t('su.recoveryHint')}</p>}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>{t('set.lock')}</h2>
        <p className="muted small">{t('set.lockHint')}</p>
        <div className="row-btns">
          {s.lockedThrough && <span>{t('set.lockedThrough')} <b className="num">{s.lockedThrough}</b></span>}
          {canSet && <Button size="sm" icon="lock" onClick={() => set({ lockedThrough: lastMonthEnd })}>{t('set.lockMonth')} ({lastMonthEnd})</Button>}
          {canSet && s.lockedThrough && <Button size="sm" onClick={() => set({ lockedThrough: '' })}>{t('set.unlock')}</Button>}
        </div>
      </section>
      <SecurityPanel canSet={canSet} />
      <FarmsPanel />
      <MessagingPanel canSet={canSet} />
      <CustomCategories canSet={canSet} />
      <BackupPanel canSet={canSet} />
      <section className="panel">
        <h2>{t('set.sync')}</h2>
        <p>{t('set.syncOff')}</p>
        <p className="muted small">{t('set.syncHint')}</p>
      </section>
      <section className="panel">
        <h2>{t('set.appearance')}</h2>
        <div className="grid2">
          <Seg label={t('set.theme')} value={prefs.theme} onChange={(v) => setPrefs({ theme: v })} options={[{ value: 'light', label: t('set.light') }, { value: 'dark', label: t('set.dark') }, { value: 'system', label: t('set.system') }]} />
          <Seg label={t('set.language')} value={prefs.lang} onChange={(v) => setPrefs({ lang: v })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
        </div>
        <div className="field">
          <span className="seg-label">{t('set.palette')}</span>
          <div className="palette-pick" role="radiogroup" aria-label={t('set.palette')}>
            {[['sage', ['#E9EEE7', '#F8FAF5', '#146654']], ['sand', ['#EDE8DF', '#FAF7F1', '#146654']], ['mist', ['#E7ECEF', '#F7F9FA', '#146654']], ['white', ['#F2F5F1', '#FFFFFF', '#146654']]].map(([k, sw]) => (
              <button type="button" role="radio" aria-checked={(prefs.palette || 'sage') === k} key={k} className={`pal ${(prefs.palette || 'sage') === k ? 'on' : ''}`} onClick={() => setPrefs({ palette: k, theme: prefs.theme === 'dark' ? 'light' : prefs.theme })}>
                <span className="pal-sw">{sw.map((c) => <i key={c} style={{ background: c }} />)}</span>{t(`pal.${k}`)}
              </button>
            ))}
          </div>
          <div className="field-msg">{t('set.paletteHint')}</div>
        </div>
      </section>
      <section className="panel">
        <h2>{t('set.about')}</h2>
        <p className="num">{t('set.version', { v: VERSION.name })} · {VERSION.season[prefs.lang]}</p>
        <div className="row-btns">
          {!demo ? <Button onClick={async () => { await app.enterDemo(sampleFarm(app.lang)); setPrefs({ profileId: 'pro-demo-owner' }); }}>{t('set.demo')}</Button>
            : <Button variant="primary" onClick={async () => { const held = await app.exitDemo(); setPrefs({ profileId: held.profiles.length === 1 && !held.profiles[0].passHash ? held.profiles[0].id : null }); }}>{t('set.demoExit')}</Button>}
          {can(actor?.role, 'purge') && !demo && <Button variant="danger" onClick={() => ui.open('erase')}>{t('set.reset')}</Button>}
        </div>
      </section>
    </div>
  );
}

function CustomCategories({ canSet }) {
  const { farm, t, commit } = useApp();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('otherGrp');
  const cats = farm.settings.categories || [];
  const add = () => {
    if (!name.trim()) return;
    commit((f) => updateSettings(f, { categories: [...cats, { key: `x-${newId('c').slice(-6)}`, name: name.trim(), group, icon: '•' }] }), { label: t('saved') });
    setName('');
  };
  return (
    <fieldset className="panel" disabled={!canSet}>
      <h2>{t('set.categories')}</h2>
      {cats.length > 0 && <div className="chips">{cats.map((c) => <span className="chip on" key={c.key}>{c.name} · {t(`g.${c.group}`)}</span>)}</div>}
      <div className="grid3">
        <TextInput label={t('name')} value={name} onChange={setName} />
        <Select label={t('exp.group')} value={group} onChange={setGroup} options={Object.keys(EXPENSE_GROUPS).map((g) => ({ value: g, label: t(`g.${g}`) }))} />
        <Field label=" "><Button icon="plus" onClick={add} disabled={!name.trim()}>{t('set.addCategory')}</Button></Field>
      </div>
    </fieldset>
  );
}
