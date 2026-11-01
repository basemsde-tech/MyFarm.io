// Clock and weather for where the farm is, from the device's precise location.
// Weather: Open-Meteo (free, no key). Place name: BigDataCloud's free reverse lookup.
// The last reading is kept on the device, so the card still shows something offline.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, readJSON } from './store.jsx';
import { Icon } from './kit.jsx';

const STORE = 'mazraati-sky-v1';
const FRESH_MS = 30 * 60000;
const read = () => readJSON(STORE, {});
const write = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* full or blocked */ } };

// WMO weather codes → a look and a label key.
export function skyOf(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

/** One digit that slides when it changes. */
function Digit({ d }) {
  const [shown, setShown] = useState(d);
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    if (d === shown) return undefined;
    setPrev(shown); setShown(d);
    const id = setTimeout(() => setPrev(null), 450);
    return () => clearTimeout(id);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="sk-digit">
      {prev != null && <span className="sk-d out" key={`o${prev}`}>{prev}</span>}
      <span className={`sk-d ${prev != null ? 'in' : ''}`} key={`i${shown}`}>{shown}</span>
    </span>
  );
}

/** Animated weather picture drawn with CSS: sun, moon, clouds, rain, snow, lightning. */
function SkyArt({ sky, day }) {
  return (
    <span className={`sky-art ${sky} ${day ? 'day' : 'night'}`} aria-hidden="true">
      {(sky === 'clear' || sky === 'partly') && (day ? <i className="sa-sun"><b /></i> : <i className="sa-moon" />)}
      {sky !== 'clear' && <i className="sa-cloud c1" />}
      {(sky === 'cloudy' || sky === 'rain' || sky === 'storm' || sky === 'snow' || sky === 'fog') && <i className="sa-cloud c2" />}
      {(sky === 'rain' || sky === 'storm') && <span className="sa-drops"><i /><i /><i /><i /></span>}
      {sky === 'snow' && <span className="sa-flakes"><i /><i /><i /><i /></span>}
      {sky === 'storm' && <i className="sa-bolt" />}
      {sky === 'fog' && <span className="sa-fog"><i /><i /></span>}
    </span>
  );
}

export function SkyClock() {
  const { t, lang } = useApp();
  const now = useNow();
  const [st, setSt] = useState(read);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const asked = useRef(false);
  const loc = lang === 'ar' ? 'ar-LB-u-nu-latn' : 'en-GB';

  const load = async (coords, quiet) => {
    setBusy(true); setErr('');
    try {
      const { latitude: lat, longitude: lon } = coords;
      const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=4`;
      const [w, place] = await Promise.all([
        fetch(wUrl).then((r) => { if (!r.ok) throw new Error('weather'); return r.json(); }),
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const next = { lat, lon, at: Date.now(), place: place ? (place.locality || place.city || place.principalSubdivision || '') : st.place || '', w, on: true };
      write(next); setSt(next);
    } catch {
      if (!quiet) setErr(t('sk.offline'));
    } finally { setBusy(false); }
  };
  const locate = (quiet) => {
    if (!('geolocation' in navigator)) { setErr(t('sk.noGeo')); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => load(p.coords, quiet), (e) => {
      setBusy(false);
      if (st.lat != null) load({ latitude: st.lat, longitude: st.lon }, true);
      else if (!quiet) setErr(e.code === 1 ? t('sk.denied') : t('sk.noFix'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10 * 60000 });
  };
  // Refresh by itself once turned on: on open, every 30 minutes, and when the page comes back.
  useEffect(() => {
    if (!st.on) return undefined;
    if (!asked.current && Date.now() - (st.at || 0) > FRESH_MS) { asked.current = true; locate(true); }
    const id = setInterval(() => locate(true), FRESH_MS);
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - (read().at || 0) > FRESH_MS) locate(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [st.on]); // eslint-disable-line react-hooks/exhaustive-deps

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateText = now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greet = hour < 5 ? 'sk.night' : hour < 12 ? 'sk.morning' : hour < 17 ? 'sk.afternoon' : hour < 21 ? 'sk.evening' : 'sk.night';
  const c = st.w?.current;
  const daily = st.w?.daily;
  const sky = c ? skyOf(c.weather_code) : 'partly';
  const isDay = c ? !!c.is_day : hour >= 6 && hour < 18;
  const days = useMemo(() => (daily ? daily.time.slice(1, 4).map((d, i) => ({ d, code: daily.weather_code[i + 1], hi: daily.temperature_2m_max[i + 1], lo: daily.temperature_2m_min[i + 1], rain: daily.precipitation_probability_max?.[i + 1] })) : []), [daily]);
  const stale = st.at && Date.now() - st.at > 3 * FRESH_MS;
  const sunTime = (iso) => (iso ? iso.slice(11, 16) : '');

  return (
    <section className={`skyclock sky-${sky} ${isDay ? 'is-day' : 'is-night'}`} aria-label={t('sk.title')}>
      <div className="sk-glow" aria-hidden="true" />
      <div className="sk-clock">
        <span className="sk-greet">{t(greet)}</span>
        <span className="sk-time num" dir="ltr" aria-label={`${hh}:${mm}`}>
          <Digit d={hh[0]} /><Digit d={hh[1]} /><span className="sk-colon">:</span><Digit d={mm[0]} /><Digit d={mm[1]} />
          <span className="sk-sec">{String(now.getSeconds()).padStart(2, '0')}</span>
        </span>
        <span className="sk-date">{dateText}</span>
      </div>
      {c ? (
        <div className="sk-weather">
          <SkyArt sky={sky} day={isDay} />
          <div className="sk-now">
            <span className="sk-temp num" dir="ltr">{Math.round(c.temperature_2m)}°</span>
            <span className="sk-cond">{t(`sk.c.${sky}`)}</span>
            <span className="sk-place small"><Icon name="globe" size={12} /> {st.place || t('sk.here')}{stale ? ` · ${t('sk.at', { t: new Date(st.at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) })}` : ''}</span>
          </div>
          <div className="sk-facts small">
            <span title={t('sk.feels')}>{t('sk.feels')} <b className="num" dir="ltr">{Math.round(c.apparent_temperature)}°</b></span>
            {daily && <span>{t('sk.rain')} <b className="num" dir="ltr">{daily.precipitation_probability_max?.[0] ?? 0}%</b></span>}
            <span>{t('sk.wind')} <b className="num" dir="ltr">{Math.round(c.wind_speed_10m)} km/h</b></span>
            <span>{t('sk.humid')} <b className="num" dir="ltr">{c.relative_humidity_2m}%</b></span>
            {daily && <span>☀ <b className="num" dir="ltr">{sunTime(daily.sunrise?.[0])}</b> · ☾ <b className="num" dir="ltr">{sunTime(daily.sunset?.[0])}</b></span>}
          </div>
          {days.length > 0 && (
            <div className="sk-days">
              {days.map((x, i) => (
                <div key={x.d} className="sk-day" style={{ '--i': i }}>
                  <span className="small">{new Date(`${x.d}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' })}</span>
                  <SkyArt sky={skyOf(x.code)} day />
                  <span className="num small" dir="ltr"><b>{Math.round(x.hi)}°</b> {Math.round(x.lo)}°</span>
                  {x.rain > 20 && <span className="sk-rainp num" dir="ltr">💧{x.rain}%</span>}
                </div>
              ))}
            </div>
          )}
          <button type="button" className="sk-refresh" onClick={() => locate(false)} disabled={busy} title={t('sk.refresh')} aria-label={t('sk.refresh')}><Icon name="undo" size={14} className={busy ? 'spin' : ''} /></button>
        </div>
      ) : (
        <div className="sk-weather empty">
          <SkyArt sky="partly" day={isDay} />
          <div className="sk-now">
            <b>{t('sk.weatherHere')}</b>
            <span className="small">{err || t('sk.why')}</span>
            <button type="button" className="sk-locate" onClick={() => locate(false)} disabled={busy}>{busy ? t('sk.locating') : t('sk.useLocation')}</button>
          </div>
        </div>
      )}
    </section>
  );
}
