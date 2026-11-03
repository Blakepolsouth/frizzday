import { HAIR, hourScore, toDays, dayScore, verdict, tips, level, LEVEL_NAMES, fmtHour, tune, frizzPoint, forecastURL } from "./engine.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem("fd:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("fd:" + k, JSON.stringify(v)); } catch {} } };
const S = Object.assign({ hair: "", porous: false, place: null, bias: 0, ratings: {}, remind: { on: false, hour: 7 } }, store.get("s", {}));
const save = () => store.set("s", S);
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
function setPlace(p) { S.place = p; save(); setErr(""); $("#geoBtn").textContent = "Use my location"; $("#cityInput").value = ""; $("#sugg").hidden = true; load(true); scheduleSync(); }

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
  ["#hero", "#hourlyCard", "#tipsCard", "#daysCard", "#rateCard", "#remindCard", "#actions", "#whyCard", "#placeBtn"].forEach(s => $(s).hidden = !has);
  if (has) $("#placeName").textContent = S.place.name;
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

  renderRate(); renderRemind();
}
$("#hero").addEventListener("click", e => {
  const t = e.target.closest("[data-d]"); if (t) { sel = +t.dataset.d; render(); return; }
  if (e.target.closest("#dewBtn")) { const det = $("#whyCard details"); det.open = true; det.scrollIntoView({ behavior: "smooth", block: "center" }); }
});
$("#days").addEventListener("click", e => { const t = e.target.closest("[data-d]"); if (t) { sel = +t.dataset.d; render(); $("#hero").scrollIntoView({ behavior: "smooth", block: "start" }); } });

/* rate your hair: teaches FrizzDay your hair */
function todayScore(bias = S.bias) { const n = localNow(), d = toDays(data).find(x => x.date === n.date); return d ? dayScore(d, S.hair, S.porous, bias)?.score ?? 0 : 0; }
function renderRate() {
  const n = localNow(), r = S.ratings[n.date], count = Object.keys(S.ratings).length;
  $("#rateTitle").textContent = n.hour < 12 ? "How's your hair this morning?" : "How did your hair do today?";
  $$(".rates button").forEach(b => b.setAttribute("aria-pressed", String(!!r && r.r === +b.dataset.r)));
  const fp = frizzPoint(S.hair, S.porous, S.bias);
  $("#tuned").innerHTML = count ? `Tuned to your hair (${count} rating${count > 1 ? "s" : ""}). Your hair starts to frizz around <b>dew point ${fp}°F</b>.` : `Rate your hair for a few days and FrizzDay learns exactly when <i>your</i> hair starts to frizz.`;
}
$(".rates").addEventListener("click", e => {
  const b = e.target.closest("button[data-r]"); if (!b || !data) return;
  const n = localNow(), prev = S.ratings[n.date], before = prev ? prev.before : S.bias, score = todayScore(before), rate = +b.dataset.r;
  S.bias = tune(before, score, rate); S.ratings[n.date] = { r: rate, score, before };
  const keys = Object.keys(S.ratings).sort(); while (keys.length > 120) delete S.ratings[keys.shift()];
  save(); render(); scheduleSync();
  toast(rate === 3 && score < 5 ? "Noted. We'll be stricter for your hair." : rate === 1 && score > 5 ? "Lucky! We'll go easier on your hair." : "Got it. Thanks!");
});

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
  $("#remindToggle").setAttribute("aria-checked", String(!!S.remind.on)); $("#remindTimeRow").hidden = !S.remind.on; $("#remindTime").value = String(S.remind.hour);
  $("#remindNote").textContent = !pushOK() ? (IOS && !standalone ? "On iPhone, add FrizzDay to your home screen first (button below), then turn this on." : "This browser can't send notifications.") : S.remind.on ? `Every morning at ${S.remind.hour}:00 AM, ${S.place?.name || "your"} time.` : "";
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
      lat: S.place.lat, lon: S.place.lon, name: S.place.name, hair: S.hair, porous: S.porous, bias: S.bias, hour: S.remind.hour, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
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
  if (!pushOK()) { if (IOS && !standalone) openInstall(); else toast("Notifications aren't available in this browser"); return; }
  if (await Notification.requestPermission() !== "granted") { $("#remindNote").textContent = "Notifications are blocked for FrizzDay. Allow them in your settings, then try again."; return; }
  S.remind.on = true; save(); renderRemind(); await sync(true); if (S.remind.on) toast("You're set. Check for a test notification.");
});
$("#remindTime").addEventListener("change", e => { S.remind.hour = +e.target.value; save(); renderRemind(); scheduleSync(); });

/* settings */
$("#placeBtn").addEventListener("click", () => editSetup());
$("#changePlace").addEventListener("click", () => editSetup());
$("#changeHair").addEventListener("click", () => editSetup());
$("#resetTune").addEventListener("click", () => { S.bias = 0; S.ratings = {}; save(); render(); scheduleSync(); toast("Tuning reset."); });
function editSetup() { $("#setup").hidden = false; $("#setup").scrollIntoView({ behavior: "smooth", block: "start" }); }

/* install */
function openInstall() {
  const steps = IOS ? ["Tap the <b>Share</b> button in Safari.", "Tap <b>Add to Home Screen</b>.", "Tap <b>Add</b>. FrizzDay opens like an app."] : ANDROID ? ["Tap the <b>⋮</b> menu in Chrome.", "Tap <b>Add to Home screen</b> or <b>Install app</b>."] : ["Click the install icon in your browser's address bar."];
  $("#instSteps").innerHTML = `<ol>${steps.map(s => `<li>${s}</li>`).join("")}</ol>`; $("#sheetBack").hidden = $("#installSheet").hidden = false;
}
const closeInstall = () => { $("#sheetBack").hidden = $("#installSheet").hidden = true; };
$("#installBtn").hidden = !!standalone;
$("#installBtn").addEventListener("click", async () => { const p = window.__bip; if (p) { try { p.prompt(); const r = await p.userChoice; window.__bip = null; if (r?.outcome === "accepted") { $("#installBtn").hidden = true; return; } } catch {} } openInstall(); });
$("#instClose").addEventListener("click", closeInstall); $("#sheetBack").addEventListener("click", closeInstall);

let tt; function toast(m) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }

if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

/* boot */
if (S.place && S.hair) load(false); else showForecast();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && data && S.place) { const c = store.get("wx", null); if (!c || Date.now() - c.at > 30 * 6e4) load(true); else render(); } });
