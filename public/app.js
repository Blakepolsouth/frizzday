import { HAIR, hourScore, toDays, dayScore, verdict, tips, level, LEVEL_NAMES, fmtHour, tune, frizzPoint, forecastURL } from "./engine.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem("fd:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("fd:" + k, JSON.stringify(v)); } catch {} } };
const S = Object.assign({ hair: "", porous: false, place: null, bias: 0, ratings: {}, remind: { on: false, hour: 7, eve: 19 }, seen: {} }, store.get("s", {}));
if (S.remind.eve == null) S.remind.eve = 19; if (!S.seen) S.seen = {};
const save = () => { store.set("s", S); saveRestore(); };
/* iPhone gives Home Screen apps their own storage, so the app's start link carries this phone's setup along. */
const b64url = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function saveRestore() {
  try {
    const c = S.hair && S.place ? b64url({ h: S.hair, p: S.porous ? 1 : 0, n: S.place.name, a: S.place.lat, o: S.place.lon, b: Math.round(S.bias * 100) / 100,
      t: S.trip ? { n: S.trip.place.name, a: S.trip.place.lat, o: S.trip.place.lon, f: S.trip.from, e: S.trip.to, k: S.trip.kind || "trip", l: S.trip.label || "" } : 0 }) : "";
    localStorage.setItem("fd:restore", JSON.stringify(c));
    const l = document.querySelector('link[rel="manifest"]'); if (l) l.href = c ? "/app.webmanifest?s=" + c : "/manifest.webmanifest";
  } catch {}
}
(() => {
  const raw = new URLSearchParams(location.search).get("restore"); if (!raw) return;
  try { history.replaceState(null, "", "/"); } catch {}
  if (S.hair && S.place) return;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/")))));
    if (o.h && isFinite(o.a) && isFinite(o.o)) { S.hair = String(o.h); S.porous = !!o.p; S.place = { name: String(o.n || "My city").slice(0, 60), lat: +o.a, lon: +o.o }; S.bias = Math.max(-3, Math.min(3, +o.b || 0)); }
    if (o.t && isFinite(o.t.a)) S.trip = { place: { name: String(o.t.n || "").slice(0, 60), lat: +o.t.a, lon: +o.t.o }, from: o.t.f, to: o.t.e, kind: o.t.k || "trip", label: String(o.t.l || "").slice(0, 40) };
    store.set("s", S);
  } catch {}
})();
const LV = ["--l0", "--l1", "--l2", "--l3", "--l4"];

/* hair type tiles */
const ICON = {
  straight: '<path d="M12 6v28M20 6v28M28 6v28" />',
  wavy: '<path d="M12 6c-4 5 4 9 0 14s4 9 0 14M20 6c-4 5 4 9 0 14s4 9 0 14M28 6c-4 5 4 9 0 14s4 9 0 14" />',
  curly: '<path d="M14 5c-5 2-5 7 0 8s5 6 0 8-5 7 0 8M26 5c-5 2-5 7 0 8s5 6 0 8-5 7 0 8" /><circle cx="14" cy="34" r="1.5"/><circle cx="26" cy="34" r="1.5"/>',
  coily: '<path d="M12 5l5 3-5 3 5 3-5 3 5 3-5 3 5 3-5 3 5 3M23 5l5 3-5 3 5 3-5 3 5 3-5 3 5 3-5 3 5 3" />'
};
$("#hairs").innerHTML = Object.entries(HAIR).map(([k, h]) => `<button type="button" class="hair" role="radio" data-h="${k}" aria-checked="${S.hair === k}"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>${h.label}</button>`).join("");
$("#hairs").addEventListener("click", e => {
  const b = e.target.closest(".hair"); if (!b) return;
  S.hair = b.dataset.h; save(); $$(".hair").forEach(x => x.setAttribute("aria-checked", String(x === b)));
  if (S.place && data) { showForecast(); render(); scheduleSync(); }
});
$("#porous").checked = !!S.porous;
$("#porous").addEventListener("change", e => { S.porous = e.target.checked; save(); if (data) render(); scheduleSync(); });

/* location */
function setErr(m) { const el = $("#setupErr"); el.textContent = m || ""; el.hidden = !m; }
$("#geoBtn").addEventListener("click", () => {
  if (!S.hair) { setErr("Pick your hair type first."); return; }
  if (!navigator.geolocation) { setErr("Location isn't available here. Search for your city instead."); return; }
  $("#geoBtn").textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(async p => {
    const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
    let name = "My location";
    try { const r = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)).json(); name = r.city || r.locality || r.principalSubdivision || name; if (r.principalSubdivisionCode) name += ", " + r.principalSubdivisionCode.split("-").pop(); } catch {}
    setPlace({ name, lat, lon });
  }, () => { $("#geoBtn").textContent = "Use my location"; setErr("Couldn't get your location. Search for your city instead."); }, { timeout: 10000, maximumAge: 6e5 });
});
let st;
$("#cityInput").addEventListener("input", e => {
  clearTimeout(st); const q = e.target.value.trim();
  if (q.length < 2) { $("#sugg").hidden = true; return; }
  st = setTimeout(async () => {
    try {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)).json();
      const list = (r.results || []);
      $("#sugg").innerHTML = list.length ? list.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)} <small>${esc([x.admin1, x.country_code === "US" ? "" : x.country].filter(Boolean).join(", "))}</small></button></li>`).join("") : `<li><button type="button" disabled>No matches</button></li>`;
      $("#sugg").hidden = false; $("#sugg")._list = list;
    } catch { setErr("Search isn't working right now. Try again in a moment."); }
  }, 250);
});
$("#sugg").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  if (!S.hair) { setErr("Pick your hair type first."); return; }
  const x = $("#sugg")._list[+b.dataset.i], abbr = x.country_code === "US" && x.admin1 ? (US[x.admin1] || x.admin1) : x.country;
  setPlace({ name: `${x.name}${abbr ? ", " + abbr : ""}`, lat: +x.latitude.toFixed(3), lon: +x.longitude.toFixed(3) });
});
const US = { Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC" };
function setPlace(p) { S.place = p; save(); setErr(""); $("#geoBtn").textContent = "Use my location"; $("#cityInput").value = ""; $("#sugg").hidden = true; $("#invite").hidden = true; load(true).then(() => { if (window.__sharedTrip) { window.__sharedTrip = false; setTimeout(() => $("#tripCard").scrollIntoView({ behavior: "smooth", block: "start" }), 300); } }); scheduleSync(); }

/* forecast */
let data = null, days = [], sel = 0;
async function load(force) {
  showForecast();
  const key = `${S.place.lat},${S.place.lon}`, cache = store.get("wx", null);
  if (!force && cache && cache.key === key && Date.now() - cache.at < 30 * 6e4) { data = cache.data; return render(); }
  $("#hero").innerHTML = `<p class="note">Checking the air…</p>`;
  try {
    const r = await fetch(forecastURL(S.place.lat, S.place.lon)); if (!r.ok) throw 0;
    data = await r.json(); store.set("wx", { key, at: Date.now(), data });
  } catch {
    if (cache && cache.key === key) data = cache.data;
    else { $("#hero").innerHTML = `<p class="verdict">Couldn't get the forecast right now.</p><button class="btn soft" id="retry" type="button">Try again</button>`; $("#retry").onclick = () => load(true); return; }
  }
  render();
}
const localNow = () => { const d = new Date(Date.now() + (data?.utc_offset_seconds || 0) * 1000); return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }; };

function showForecast() {
  const has = !!(S.place && S.hair);
  $("#intro").hidden = has; $("#setup").hidden = has;
  ["#hero", "#hourlyCard", "#tipsCard", "#daysCard", "#rateCard", "#remindCard", "#actions", "#tripCard", "#whyCard", "#placeBtn"].forEach(s => $(s).hidden = !has);
  if (has) $("#placeName").textContent = S.place.name.split(",")[0];
}
function render() {
  const now = localNow();
  days = toDays(data).filter(d => d.date >= now.date).slice(0, 4);
  if (sel >= days.length) sel = 0;
  const d = days[sel], ds = dayScore(d, S.hair, S.porous, S.bias); if (!ds) return;
  const L = level(ds.score), when = sel === 0 ? "Today" : sel === 1 ? "Tomorrow" : new Date(d.date + "T12:00").toLocaleDateString("en-US", { weekday: "long" });
  const hero = $("#hero"); hero.style.setProperty("--lv", `var(${LV[L]})`); hero.style.setProperty("--lvsoft", `color-mix(in srgb, var(${LV[L]}) 16%, transparent)`);
  const C = 2 * Math.PI * 80, frac = Math.max(.02, ds.score / 10);
  hero.innerHTML = `
    <div class="daytabs" role="tablist">${days.slice(0, 2).map((x, i) => `<button type="button" role="tab" data-d="${i}" aria-selected="${i === sel}">${i ? "Tomorrow" : "Today"}</button>`).join("")}${sel > 1 ? `<button type="button" role="tab" aria-selected="true">${when}</button>` : ""}</div>
    <div class="ring"><svg viewBox="0 0 190 190" aria-hidden="true"><circle cx="95" cy="95" r="80" fill="none" stroke="var(--sunk)" stroke-width="14"/><circle class="arc" cx="95" cy="95" r="80" fill="none" stroke="var(${LV[L]})" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
      <div class="num"><b>${Math.round(ds.score)}</b><span>out of 10 frizz</span></div></div>
    <div class="lvname">${LEVEL_NAMES[L]}</div>
    <p class="verdict">${esc(verdict(ds, d.date + S.hair))}</p>
    <div class="chips"><span class="chip">${esc(ds.window)}</span>${ds.rainMax >= 40 ? `<span class="chip">${ds.rainMax}% rain chance</span>` : ""}</div>
    <button class="dewinfo" id="dewBtn" type="button">Dew point ${Math.round(ds.kind === "dry" ? ds.dewMin : ds.dewMax)}°F${ds.kind === "dry" ? " (dry air)" : ""} · why it matters</button>`;
  hero.setAttribute("aria-label", `${when}: frizz ${Math.round(ds.score)} out of 10, ${LEVEL_NAMES[L]}`);

  $("#hourlyLabel").textContent = `${when}, hour by hour`;
  const hrs = d.hours.filter(h => h.hour >= 8 && h.hour <= 22);
  $("#hours").innerHTML = hrs.map(h => { const s = ds.hours.find(x => x.hour === h.hour)?.score ?? hourScore(h, S.hair, S.porous, S.bias).score; const lv = level(s); const isNow = sel === 0 && h.hour === now.hour;
    return `<div class="hcol${isNow ? " now" : ""}" title="${fmtHour(h.hour)}: ${Math.round(s)}/10"><div class="hbar" style="height:${8 + s * 9}px;background:var(${LV[lv]})"></div><small>${isNow ? "now" : h.hour % 3 === 2 && !(sel === 0 && Math.abs(h.hour - now.hour) <= 1) ? fmtHour(h.hour).replace(" ", "").toLowerCase() : ""}</small></div>`; }).join("");

  $("#tipsLabel").textContent = sel === 0 ? "Today's game plan" : `${when}'s game plan`;
  $("#tips").innerHTML = tips(ds, S.hair).map(([t, b], i) => `<div class="tip"><i>${i + 1}</i><div><b>${esc(t)}</b><span>${esc(b)}</span></div></div>`).join("");

  $("#days").innerHTML = days.slice(1, 4).map((x, i) => { const s = dayScore(x, S.hair, S.porous, S.bias); const l = level(s.score);
    return `<button type="button" class="dcard" data-d="${i + 1}" style="--lv:var(${LV[l]})"><span>${i === 0 ? "Tomorrow" : new Date(x.date + "T12:00").toLocaleDateString("en-US", { weekday: "short" })}</span><b>${Math.round(s.score)}</b><span>${LEVEL_NAMES[l]}</span></button>`; }).join("");

  const tds = sel === 0 ? ds : dayScore(days[0], S.hair, S.porous, S.bias);
  if (days[0].date === now.date && tds) { const prev = S.seen[now.date], sc = Math.round(tds.score * 10) / 10; if (!prev || prev.s !== sc) { S.seen[now.date] = { s: sc, b: S.bias }; const k = Object.keys(S.seen).sort(); while (k.length > 30) delete S.seen[k.shift()]; save(); } }
  renderRate(); renderRemind(); renderTrip();
}
$("#hero").addEventListener("click", e => {
  const t = e.target.closest("[data-d]"); if (t) { sel = +t.dataset.d; render(); return; }
  if (e.target.closest("#dewBtn")) { const det = $("#whyCard details"); det.open = true; det.scrollIntoView({ behavior: "smooth", block: "center" }); }
});
$("#days").addEventListener("click", e => { const t = e.target.closest("[data-d]"); if (t) { sel = +t.dataset.d; render(); $("#hero").scrollIntoView({ behavior: "smooth", block: "start" }); } });

/* rate your hair: teaches FrizzDay your hair */
function todayScore(bias = S.bias) { const n = localNow(), d = toDays(data).find(x => x.date === n.date); return d ? dayScore(d, S.hair, S.porous, bias)?.score ?? 0 : 0; }
const GOAL = 7;
const addDays = (date, k) => new Date(Date.parse(date + "T12:00:00Z") + k * 864e5).toISOString().slice(0, 10);
let askDate = new URLSearchParams(location.search).get("rate"); // opened from the evening check-in
if (askDate) history.replaceState(null, "", location.pathname);
let justRated = null;
function rateTarget() {
  const n = localNow(), yest = addDays(n.date, -1);
  if (askDate === n.date || (askDate === yest && S.seen[yest])) return { date: askDate, ask: !S.ratings[askDate] || justRated === askDate };
  if (justRated === yest || (n.hour < 11 && S.seen[yest] && !S.ratings[yest] && !S.ratings[n.date])) return { date: yest, ask: true };
  return { date: n.date, ask: n.hour >= 16 && (!S.ratings[n.date] || justRated === n.date) };
}
function streak() { const n = localNow(); let d = S.ratings[n.date] ? n.date : addDays(n.date, -1), k = 0; while (S.ratings[d]) { k++; d = addDays(d, -1); } return k; }
function renderRate() {
  const n = localNow(), T = rateTarget(), r = S.ratings[T.date], count = Object.keys(S.ratings).length, isY = T.date !== n.date;
  const said = isY ? S.seen[T.date]?.s : todayScore(r ? r.before : S.bias);
  const card = $("#rateCard"); card.classList.toggle("ask", T.ask); card.classList.toggle("done", !!r);
  if (T.ask) $("#hero").before(card); else $("#daysCard").after(card);
  $("#rateKicker").textContent = r ? "Logged. Thank you!" : count < GOAL ? `Teach FrizzDay your hair · day ${count + 1} of ${GOAL}` : "Daily hair check";
  $("#rateTitle").textContent = isY ? "How did your hair do yesterday?" : n.hour < 12 ? "How's your hair this morning?" : "How did your hair do today?";
  $("#rateSub").textContent = r ? (r.r === 1 ? "Great hair day, logged." : r.r === 2 ? "Okay day, logged." : "Frizz day, logged.") + " Tap another face to change it."
    : said != null ? `We called it ${Math.round(said)} out of 10${isY ? " yesterday" : " today"}. Were we right? One tap makes tomorrow's forecast more accurate for you.` : "One tap makes your forecast more accurate.";
  $$(".rates button").forEach(b => b.setAttribute("aria-pressed", String(!!r && r.r === +b.dataset.r)));
  const on = Math.min(count, GOAL), st = streak();
  $("#learn").innerHTML = `<div class="dots" aria-hidden="true">${Array.from({ length: GOAL }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join("")}</div>
    <small>${count >= GOAL ? `Fully tuned to your hair · ${count} days logged` : count ? `Learning your hair: ${count} of ${GOAL} days. ${GOAL - count} more and it's tuned to you.` : `Rate ${GOAL} days and FrizzDay learns exactly when <i>your</i> hair frizzes.`}${st >= 2 ? ` · 🔥 ${st}-day streak` : ""}</small>`;
  const fp = frizzPoint(S.hair, S.porous, S.bias);
  $("#tuned").innerHTML = count ? `So far, your hair starts to frizz around <b>dew point ${fp}°F</b>.` : "";
  $("#tuned").hidden = !count;
}
$(".rates").addEventListener("click", e => {
  const b = e.target.closest("button[data-r]"); if (!b || !data) return;
  const n = localNow(), T = rateTarget(), date = T.date, prev = S.ratings[date], rate = +b.dataset.r;
  const before = prev ? prev.before : date === n.date ? S.bias : (S.seen[date]?.b ?? S.bias);
  const score = date === n.date ? todayScore(before) : (S.seen[date]?.s ?? todayScore(before));
  S.bias = tune(before, score, rate); S.ratings[date] = { r: rate, score, before }; justRated = date;
  const keys = Object.keys(S.ratings).sort(); while (keys.length > 120) delete S.ratings[keys.shift()];
  save(); render(); scheduleSync();
  const count = Object.keys(S.ratings).length;
  toast(rate === 3 && score < 5 ? "Noted. We'll be stricter for your hair." : rate === 1 && score > 5 ? "Lucky! We'll go easier on your hair." : count < GOAL ? `Got it. ${count} of ${GOAL} days, FrizzDay is learning you.` : "Got it. Thanks!");
});

/* trip: frizz forecast for where you're headed */
const TRIP_DAYS = 16; // how far ahead the forecast reaches
const KINDS = [["trip", "✈️ Trip"], ["wedding", "💍 Wedding"], ["concert", "🎤 Concert"], ["game", "🏈 Game day"], ["prom", "💃 Prom"], ["grad", "🎓 Graduation"], ["other", "✨ Something else"]];
const KIND_EMOJI = Object.fromEntries(KINDS.map(([k, n]) => [k, n.split(" ")[0]]));
const tripName = t => t.label || (t.kind && t.kind !== "trip" && t.kind !== "other" ? KINDS.find(k => k[0] === t.kind)[1].replace(/^\S+ /, "") + " in " + t.place.name.split(",")[0] : t.place.name.split(",")[0]);
let tripData = null, tripSt, tripDraft = null;
const tripURL = (lat, lon) => forecastURL(lat, lon).replace("forecast_days=4", "forecast_days=" + TRIP_DAYS);
const fmtD = (s, o = { weekday: "short", month: "short", day: "numeric" }) => new Date(s + "T12:00").toLocaleDateString("en-US", o);
function tripLive() { const t = S.trip; if (!t) return null; if (t.to < localNow().date) { S.trip = null; save(); scheduleSync(); return null; } return t; }
async function loadTrip() {
  const t = S.trip; if (!t) return;
  const key = `${t.place.lat},${t.place.lon}`, c = store.get("tripwx", null);
  if (c && c.key === key && Date.now() - c.at < 60 * 6e4) { tripData = c.data; return renderTrip(); }
  try { const r = await fetch(tripURL(t.place.lat, t.place.lon)); if (!r.ok) throw 0; tripData = await r.json(); store.set("tripwx", { key, at: Date.now(), data: tripData }); }
  catch { tripData = c && c.key === key ? c.data : null; }
  renderTrip();
}
function renderTrip() {
  const body = $("#tripBody"); if (!body) return;
  const t = tripLive(), today = localNow().date, maxD = addDays(today, TRIP_DAYS - 1);
  if (!t) {
    const d = tripDraft || { from: today, to: addDays(today, 2) };
    $("#tripTitle").textContent = "Taking your hair on a trip?";
    body.innerHTML = `<p class="tripsub">Add where you're going and your dates. You'll get a frizz score for each day you're there, plus what to pack.</p>
      <div class="search"><input id="tripCity" type="search" placeholder="Where are you headed?" autocomplete="off" aria-label="Trip city" value="${esc(d.place?.name || "")}"><ul class="sugg" id="tripSugg" hidden></ul></div>
      <div class="tripdates"><label><span>What's the occasion?</span><select id="tripKind">${KINDS.map(([k, n]) => `<option value="${k}"${(d.kind || "trip") === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label><span>Name it (optional)</span><input id="tripLabel" maxlength="40" placeholder="Sarah's wedding" value="${esc(d.label || "")}"></label></div>
      <div class="tripdates"><label><span>Arrive</span><input type="date" id="tripFrom" value="${d.from}" min="${today}" max="${maxD}"></label><label><span>Leave</span><input type="date" id="tripTo" value="${d.to}" min="${today}"></label></div>
      <button class="btn" id="tripSave" type="button">See my trip forecast</button><p class="note" id="tripErr" hidden></p>`;
    return;
  }
  const nights = Math.round((Date.parse(t.to) - Date.parse(t.from)) / 864e5);
  t.when = `${fmtD(t.from, { month: "short", day: "numeric" })}${nights ? "–" + fmtD(t.to, t.from.slice(0, 7) === t.to.slice(0, 7) ? { day: "numeric" } : { month: "short", day: "numeric" }) : ""}`;
  $("#tripTitle").textContent = `${KIND_EMOJI[t.kind || "trip"]} ${tripName(t)}, ${t.when}`;
  if (!tripData) { body.innerHTML = `<p class="tripsub">Checking the air in ${esc(t.place.name)}…</p>`; loadTrip(); return; }
  const fdays = toDays(tripData), list = [];
  for (let d = t.from; d <= t.to; d = addDays(d, 1)) {
    const day = fdays.find(x => x.date === d), ds = day ? dayScore(day, S.hair, S.porous, S.bias) : null;
    list.push({ d, ds });
  }
  const known = list.filter(x => x.ds), worst = known.slice().sort((a, b) => b.ds.score - a.ds.score)[0];
  const home = toDays(data).find(x => x.date === today), homeS = home ? dayScore(home, S.hair, S.porous, S.bias)?.score : null;
  const cards = list.map(({ d, ds }) => { if (!ds) return `<div class="dcard tday"><span>${fmtD(d, { weekday: "short" })} ${fmtD(d, { month: "numeric", day: "numeric" })}</span><b style="color:var(--muted)">–</b><span>${d > maxD ? "Too far out" : "No data"}</span></div>`;
    const l = level(ds.score); return `<div class="dcard tday" style="--lv:var(${LV[l]})"><span>${fmtD(d, { weekday: "short" })} ${fmtD(d, { month: "numeric", day: "numeric" })}</span><b>${Math.round(ds.score)}</b><span>${LEVEL_NAMES[l]}</span></div>`; }).join("");
  const far = list.some(x => !x.ds && x.d > maxD), early = known.some(x => x.d > addDays(today, 6));
  let pack = "";
  if (worst) {
    const [tt, tb] = tips(worst.ds, S.hair)[0] || [];
    const cmp = homeS != null && known.length ? (() => { const avg = known.reduce((a, x) => a + x.ds.score, 0) / known.length, diff = avg - homeS; return Math.abs(diff) < 1 ? "About the same frizz as home." : diff >= 4 ? "Way frizzier than home, so pack your heavy hitters." : diff > 0 ? `A little frizzier than home.` : `Easier on your hair than home.`; })() : "";
    pack = `<div class="pack"><div class="label">What to pack</div><p><b>Worst day: ${fmtD(worst.d, { weekday: "long" })} (${Math.round(worst.ds.score)}/10).</b> ${esc(verdict(worst.ds, worst.d + S.hair))} ${esc(cmp)}</p>${tt ? `<p><b>${esc(tt)}.</b> ${esc(tb)}</p>` : ""}</div>`;
  }
  body.innerHTML = `<p class="tripsub">${esc(t.place.name)}</p><div class="days tripdays">${cards}</div>${pack}
    ${far ? `<p class="note">Forecasts reach about 2 weeks out. Days marked "too far out" fill in as your trip gets closer.</p>` : early ? `<p class="note">Days more than a week out are an early look and can shift.</p>` : ""}
    ${S.remind.on && S.remind.hour ? `<p class="note">While you're there, your morning frizz report switches to ${esc(t.place.name.split(",")[0])} automatically.</p>` : ""}
    <button class="btn berry" id="tripShare" type="button">Share with your group</button>
    <p class="note" style="text-align:center;margin-top:-4px">Friends see the forecast tuned to their own hair.</p>
    <div class="row" style="margin-top:6px"><button class="link" id="tripEdit" type="button">Change trip</button><button class="link" id="tripDel" type="button">Remove trip</button></div>`;
}
$("#tripCard").addEventListener("input", e => {
  if (e.target.id !== "tripCity") return;
  clearTimeout(tripSt); const q = e.target.value.trim(), box = $("#tripSugg");
  tripDraft = { ...(tripDraft || {}), place: null };
  if (q.length < 2) { box.hidden = true; return; }
  tripSt = setTimeout(async () => {
    try {
      const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)).json(), list = r.results || [];
      box.innerHTML = list.length ? list.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)} <small>${esc([x.admin1, x.country_code === "US" ? "" : x.country].filter(Boolean).join(", "))}</small></button></li>`).join("") : `<li><button type="button" disabled>No matches</button></li>`;
      box.hidden = false; box._list = list;
    } catch {}
  }, 250);
});
$("#tripCard").addEventListener("change", e => {
  if (e.target.id === "tripFrom") { const f = e.target.value, to = $("#tripTo"); to.min = f; if (to.value < f) to.value = f; }
});
$("#tripCard").addEventListener("click", e => {
  const s = e.target.closest("#tripSugg button[data-i]");
  if (s) { const x = $("#tripSugg")._list[+s.dataset.i], abbr = x.country_code === "US" && x.admin1 ? (US[x.admin1] || x.admin1) : x.country;
    tripDraft = { ...(tripDraft || {}), place: { name: `${x.name}${abbr ? ", " + abbr : ""}`, lat: +x.latitude.toFixed(3), lon: +x.longitude.toFixed(3) } };
    $("#tripCity").value = tripDraft.place.name; $("#tripSugg").hidden = true; return; }
  if (e.target.id === "tripSave") {
    const from = $("#tripFrom").value, to = $("#tripTo").value, err = m => { $("#tripErr").textContent = m; $("#tripErr").hidden = false; };
    if (!tripDraft?.place) return err("Pick your destination from the list.");
    if (!from || !to) return err("Add your dates.");
    if (to < from) return err("Your leave date is before your arrival.");
    if (Math.round((Date.parse(to) - Date.parse(from)) / 864e5) > 20) return err("Keep it to 3 weeks or less.");
    S.trip = { place: tripDraft.place, from, to, kind: $("#tripKind").value, label: $("#tripLabel").value.replace(/[<>]/g, "").trim().slice(0, 40) }; tripDraft = null; tripData = null; save(); scheduleSync(); renderTrip();
    $("#tripCard").scrollIntoView({ behavior: "smooth", block: "start" }); toast("Trip added. Bon voyage, hair.");
  }
  if (e.target.id === "tripShare") { shareTrip(); return; }
  if (e.target.id === "tripEdit") { tripDraft = { ...S.trip }; S.trip = null; save(); renderTrip(); }
  if (e.target.id === "tripDel") { S.trip = null; tripData = null; save(); scheduleSync(); renderTrip(); toast("Trip removed."); }
});

/* share a trip or event with friends: an image plus a link that opens FrizzDay with the event filled in */
const b64u = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))));
function tripLink(t) { return `https://frizzday.com/?t=${b64u({ n: t.place.name, a: t.place.lat, o: t.place.lon, f: t.from, e: t.to, k: t.kind || "trip", l: t.label || "" })}`; }
async function shareTrip() {
  const t = S.trip; if (!t || !tripData) return;
  const fdays = toDays(tripData), list = [];
  for (let d = t.from; d <= t.to && list.length < 5; d = addDays(d, 1)) { const day = fdays.find(x => x.date === d); list.push({ d, ds: day ? dayScore(day, S.hair, S.porous, S.bias) : null }); }
  const cs = getComputedStyle(document.documentElement), c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const g = c.getContext("2d");
  try { await document.fonts.ready; } catch {}
  g.fillStyle = "#fbf3ef"; g.fillRect(0, 0, 1080, 1350); g.textAlign = "center";
  g.font = "120px system-ui, sans-serif"; g.fillText(KIND_EMOJI[t.kind || "trip"], 540, 200);
  g.fillStyle = "#2b1d2a"; g.font = "84px 'Instrument Serif', Georgia, serif"; const one = g.measureText(tripName(t)).width <= 940; wrap(g, tripName(t), 540, one ? 360 : 330, 940, 92);
  g.fillStyle = "#7a6874"; g.font = "700 40px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText(`${t.place.name} · ${t.when}`, 540, one ? 450 : 520);
  g.fillStyle = "#2b1d2a"; g.font = "700 38px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText("Frizz forecast", 540, 630);
  const w = 180, gap = 18, x0 = 540 - (list.length * w + (list.length - 1) * gap) / 2;
  list.forEach(({ d, ds }, i) => {
    const x = x0 + i * (w + gap), l = ds ? level(ds.score) : 0, col = ds ? cs.getPropertyValue(LV[l]).trim() || "#b8336a" : "#b7a9b2";
    g.fillStyle = "#f3e6e0"; g.beginPath(); g.roundRect ? g.roundRect(x, 670, w, 250, 28) : g.rect(x, 670, w, 250); g.fill();
    g.fillStyle = "#7a6874"; g.font = "700 32px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText(fmtD(d, { weekday: "short" }), x + w / 2, 730);
    g.fillStyle = col; g.font = "800 110px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText(ds ? Math.round(ds.score) : "?", x + w / 2, 850);
    g.fillStyle = "#7a6874"; g.font = "600 24px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText(ds ? "/10" : "soon", x + w / 2, 892);
  });
  g.fillStyle = "#2b1d2a"; g.font = "44px 'Plus Jakarta Sans', system-ui, sans-serif"; wrap(g, "Will your hair survive it? Get the forecast tuned to your hair type.", 540, 1040, 900, 58);
  g.fillStyle = "#b8336a"; g.font = "64px 'Instrument Serif', Georgia, serif"; g.fillText("frizzday.com", 540, 1260);
  const url = tripLink(t), text = `${tripName(t)} (${t.when}): here's the frizz forecast 💁 Tap to see it tuned to your hair:`;
  const blob = await new Promise(r => c.toBlob(r, "image/png")), file = new File([blob], "frizzday-forecast.png", { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file], url })) { await navigator.share({ files: [file], text, url }); return; }
    if (navigator.share) { await navigator.share({ text, url }); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied. Paste it in your group chat."); } catch { prompt("Copy this link:", url); }
}
/* opened from a friend's shared link */
(() => {
  const raw = new URLSearchParams(location.search).get("t"); if (!raw) return;
  history.replaceState(null, "", location.pathname);
  try {
    const o = unb64u(raw), ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isFinite(o.a) || !isFinite(o.o) || !ok(o.f) || !ok(o.e) || o.e < o.f) return;
    S.trip = { place: { name: String(o.n || "").replace(/[<>]/g, "").slice(0, 60), lat: +o.a, lon: +o.o }, from: o.f, to: o.e, kind: KIND_EMOJI[o.k] ? o.k : "trip", label: String(o.l || "").replace(/[<>]/g, "").slice(0, 40) };
    save(); window.__sharedTrip = true;
    if (!(S.place && S.hair)) { const el = $("#invite"); el.hidden = false; el.innerHTML = `${KIND_EMOJI[S.trip.kind]} <b>${esc(tripName(S.trip))}</b> was shared with you. Pick your hair type and your city below, and you'll see the forecast for it tuned to your hair.`; }
  } catch {}
})();

/* share card */
$("#shareBtn").addEventListener("click", async () => {
  const d = days[sel], ds = dayScore(d, S.hair, S.porous, S.bias), L = level(ds.score);
  const cs = getComputedStyle(document.documentElement), col = cs.getPropertyValue(LV[L]).trim() || "#b8336a";
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const g = c.getContext("2d");
  try { await document.fonts.ready; } catch {}
  g.fillStyle = "#fbf3ef"; g.fillRect(0, 0, 1080, 1350);
  const grd = g.createRadialGradient(540, 300, 50, 540, 300, 800); grd.addColorStop(0, col + "33"); grd.addColorStop(1, "#fbf3ef00"); g.fillStyle = grd; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = "center"; g.fillStyle = "#2b1d2a";
  g.font = "60px 'Instrument Serif', Georgia, serif"; g.fillText(`${sel === 0 ? "Today" : sel === 1 ? "Tomorrow" : "This week"} in ${S.place.name}`, 540, 170);
  g.lineWidth = 40; g.strokeStyle = "#f0e2db"; g.beginPath(); g.arc(540, 560, 250, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = col; g.lineCap = "round"; g.beginPath(); g.arc(540, 560, 250, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.02, ds.score / 10)); g.stroke();
  g.fillStyle = col; g.font = "800 230px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText(Math.round(ds.score), 540, 640);
  g.fillStyle = "#7a6874"; g.font = "700 40px 'Plus Jakarta Sans', system-ui, sans-serif"; g.fillText("out of 10 frizz", 540, 715);
  g.fillStyle = col; g.font = "100px 'Instrument Serif', Georgia, serif"; g.fillText(LEVEL_NAMES[L], 540, 950);
  g.fillStyle = "#2b1d2a"; g.font = "48px 'Plus Jakarta Sans', system-ui, sans-serif";
  wrap(g, verdict(ds, d.date + S.hair), 540, 1040, 900, 62);
  g.fillStyle = "#b8336a"; g.font = "64px 'Instrument Serif', Georgia, serif"; g.fillText("frizzday.com", 540, 1270);
  const blob = await new Promise(r => c.toBlob(r, "image/png")), file = new File([blob], "frizzday.png", { type: "image/png" });
  const text = `Frizz ${Math.round(ds.score)}/10 ${sel === 0 ? "today" : "tomorrow"} in ${S.place.name}. ${LEVEL_NAMES[L]}. frizzday.com`;
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; } if (navigator.share) { await navigator.share({ text, url: "https://frizzday.com" }); return; } } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "frizzday.png"; a.click(); toast("Image saved. Post it anywhere.");
});
function wrap(g, text, x, y, max, lh) { const words = text.split(" "); let line = "", yy = y; for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > max && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = t; } if (line) g.fillText(line, x, yy); }

/* morning frizz report (web push) */
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const ua = navigator.userAgent, IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1), ANDROID = /Android/.test(ua);
const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
function renderRemind() {
  $("#remindToggle").setAttribute("aria-checked", String(!!S.remind.on)); $("#remindTimeRow").hidden = $("#eveTimeRow").hidden = !S.remind.on; $("#remindTime").value = String(S.remind.hour); $("#eveTime").value = String(S.remind.eve);
  const parts = [S.remind.hour ? `your forecast at ${S.remind.hour}:00 AM` : "", S.remind.eve ? `a hair check at ${S.remind.eve - 12}:00 PM (only if you haven't rated yet)` : ""].filter(Boolean);
  $("#remindNote").textContent = !pushOK() ? (IOS && !standalone ? "On iPhone, add FrizzDay to your home screen first (button below), then turn this on." : "This browser can't send notifications.") : S.remind.on ? (parts.length ? `You'll get ${parts.join(" and ")}.` : "Both are off. Pick a time above.") : "";
}
async function subscription() {
  const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
  if (!sub) { const { publicKey } = await (await fetch("/api/remind")).json(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }); }
  return sub;
}
let syncT;
function scheduleSync(confirm) { if (!S.remind.on || !S.place) return; clearTimeout(syncT); syncT = setTimeout(() => sync(confirm), confirm ? 0 : 1200); }
async function sync(confirm) {
  try {
    const sub = await subscription();
    const r = await fetch("/api/remind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "on", subscription: sub.toJSON(), confirm: !!confirm,
      lat: S.place.lat, lon: S.place.lon, name: S.place.name, hair: S.hair, porous: S.porous, bias: S.bias, hour: S.remind.hour, eve: S.remind.eve, trip: S.trip ? { name: S.trip.place.name, lat: S.trip.place.lat, lon: S.trip.place.lon, from: S.trip.from, to: S.trip.to } : null, lastRated: Object.keys(S.ratings).sort().pop() || "", tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    if (r.status === 410) { await sub.unsubscribe(); return sync(confirm); }
    if (!r.ok) throw 0;
  } catch { if (confirm) { S.remind.on = false; save(); renderRemind(); toast("Couldn't turn that on. Try again in a moment."); } }
}
$("#remindToggle").addEventListener("click", async () => {
  if (S.remind.on) {
    S.remind.on = false; save(); renderRemind();
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await fetch("/api/remind", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "off", subscription: sub.toJSON() }) }); } catch {}
    return;
  }
  if (!pushOK()) { if (IOS && !standalone) openInstall("notify"); else toast("Notifications aren't available in this browser"); return; }
  if (await Notification.requestPermission() !== "granted") { $("#remindNote").textContent = "Notifications are blocked for FrizzDay. Allow them in your settings, then try again."; return; }
  S.remind.on = true; save(); renderRemind(); await sync(true); if (S.remind.on) toast("You're set. Check for a test notification.");
});
$("#remindTime").addEventListener("change", e => { S.remind.hour = +e.target.value; save(); renderRemind(); scheduleSync(); });
$("#eveTime").addEventListener("change", e => { S.remind.eve = +e.target.value; save(); renderRemind(); scheduleSync(); });

/* settings */
$("#placeBtn").addEventListener("click", () => editSetup());
$("#changePlace").addEventListener("click", () => editSetup());
$("#changeHair").addEventListener("click", () => editSetup());
$("#resetTune").addEventListener("click", () => { S.bias = 0; S.ratings = {}; save(); render(); scheduleSync(); toast("Tuning reset."); });
function editSetup() { $("#setup").hidden = false; $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }); }

/* install: the simplest possible steps, with an arrow pointing at the button to tap */
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|Twitter|Pinterest|GSA\//.test(ua);
const IOS_BROWSER = /CriOS/.test(ua) ? "chrome" : /FxiOS/.test(ua) ? "firefox" : /EdgiOS/.test(ua) ? "edge" : "safari";
const SAFARI_V = +((ua.match(/Version\/(\d+)/) || [])[1] || 0), IPAD = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const IC = {
  share: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dots: '<svg viewBox="0 0 24 24" class="ico"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  add: '<svg viewBox="0 0 24 24" class="ico"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};
const istep = (n, h) => `<li class="istep"><span class="inum">${n}</span><span>${h}</span></li>`;
function guide(reason) {
  const why = `<p class="iwhy">${reason === "notify" ? "iPhone only sends notifications to apps on your Home Screen." : "Free. No App Store. About 10 seconds."}${S.hair && S.place ? " Your hair settings come with you." : ""}</p>`;
  if (IOS && IN_APP) return { html: `${why}<ol class="isteps">${istep(1, "This page is open inside another app. Tap <b>Copy link</b>.")}${istep(2, "Open <b>Safari</b>, paste it, and tap <b>Get the app</b> again.")}</ol><button class="btn berry" id="icopy" type="button" style="width:100%;margin-top:12px">Copy link</button>`, arrow: null };
  if (IOS && IOS_BROWSER !== "safari") return { html: `${why}<ol class="isteps">${istep(1, `Tap ${IC.share} <b>Share</b> ${IOS_BROWSER === "chrome" ? "in the address bar" : "in the menu"}.`)}${istep(2, `Tap ${IC.add} <b>Add to Home Screen</b>, then <b>Add</b>.`)}</ol>`, arrow: IOS_BROWSER === "chrome" ? "topright" : "bottomright" };
  if (IOS) {
    const n26 = SAFARI_V >= 26;
    return { html: `${why}<ol class="isteps">${istep(1, n26 ? `Tap ${IC.dots} at the bottom right, then ${IC.share} <b>Share</b>.` : `Tap ${IC.share} <b>Share</b> ${IPAD ? "at the top" : "at the bottom"}.`)}${istep(2, `Tap ${IC.add} <b>Add to Home Screen</b>, then <b>Add</b>.`)}</ol>${n26 ? `<p class="inote">Don't see Add to Home Screen? Scroll down in that menu.</p>` : ""}`, arrow: IPAD ? "topright" : n26 ? "bottomright" : "bottom" };
  }
  if (ANDROID) return { html: `<ol class="isteps">${istep(1, "Tap the <b>⋮</b> menu at the top right.")}${istep(2, "Tap <b>Install app</b> or <b>Add to Home screen</b>.")}</ol>`, arrow: "topright" };
  return { html: `<ol class="isteps">${istep(1, "On your phone, open <b>frizzday.com</b> and tap <b>Get the app</b>.")}</ol>`, arrow: null };
}
function openInstall(reason) {
  // the Home Screen app should start with this phone's settings: reload once if they changed since the page opened
  const want = (() => { try { return JSON.parse(localStorage.getItem("fd:restore") || '""') || ""; } catch { return ""; } })();
  if (IOS && !IN_APP && want !== (window.__mf || "")) { try { sessionStorage.setItem("fd:reopen", reason || "1"); } catch {} location.reload(); return; }
  const g = guide(reason), ptr = $("#instPointer");
  $("#instTitle").textContent = reason === "notify" ? "First, add FrizzDay to your Home Screen" : "Get FrizzDay on your phone";
  $("#instSteps").innerHTML = g.html; ptr.className = "pointer " + (g.arrow || ""); ptr.hidden = !g.arrow;
  const c = $("#icopy"); if (c) c.onclick = async () => { try { await navigator.clipboard.writeText("https://frizzday.com/"); toast("Copied. Now open Safari and paste it."); } catch { prompt("Copy this link:", "https://frizzday.com/"); } };
  $("#sheetBack").hidden = $("#installSheet").hidden = false;
}
const closeInstall = () => { $("#sheetBack").hidden = $("#installSheet").hidden = $("#welcomeSheet").hidden = true; $("#instPointer").hidden = true; };
async function getApp() { const p = window.__bip; if (p) { try { window.__bip = null; await p.prompt(); const r = await p.userChoice; if (r?.outcome === "accepted") { $("#getApp").hidden = $("#installBtn").hidden = true; return; } if (r?.outcome === "dismissed") return; } catch {} } openInstall(); }
$("#getApp").hidden = $("#installBtn").hidden = !!standalone;
$("#getApp").addEventListener("click", getApp); $("#installBtn").addEventListener("click", getApp);
$("#instClose").addEventListener("click", closeInstall); $("#sheetBack").addEventListener("click", closeInstall); $("#welClose").addEventListener("click", closeInstall);
window.addEventListener("appinstalled", () => { $("#getApp").hidden = $("#installBtn").hidden = true; closeInstall(); });
try { const r = sessionStorage.getItem("fd:reopen"); if (r) { sessionStorage.removeItem("fd:reopen"); setTimeout(() => openInstall(r === "notify" ? "notify" : undefined), 400); } } catch {}
/* first open from the Home Screen: offer the morning forecast (this tap counts as permission on iPhone) */
if (standalone && !store.get("welcomed", false)) {
  store.set("welcomed", true);
  if (S.hair && S.place && !S.remind.on) setTimeout(() => { $("#sheetBack").hidden = $("#welcomeSheet").hidden = false; }, 900);
}
$("#welOn").addEventListener("click", () => { closeInstall(); $("#remindToggle").click(); });

let tt; function toast(m) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }

if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

/* boot */
saveRestore();
if (S.place && S.hair) load(false).then(() => { if (window.__sharedTrip) { window.__sharedTrip = false; setTimeout(() => $("#tripCard").scrollIntoView({ behavior: "smooth", block: "start" }), 300); toast("Added to your FrizzDay"); } }); else showForecast();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && data && S.place) { const c = store.get("wx", null); if (!c || Date.now() - c.at > 30 * 6e4) load(true); else render(); } });
