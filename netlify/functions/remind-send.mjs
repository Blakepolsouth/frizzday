// Runs at the top of every hour. Sends the morning frizz report to everyone whose chosen hour it is, in their own time zone.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys, SITE } from "../lib/push.mjs";
import { toDays, dayScore, verdict, level, LEVEL_NAMES, forecastURL } from "../../public/engine.js";
const localParts = tz => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 }; };
const EMOJI = ["✨", "👍", "🤞", "🦁", "🌀"];
export default async () => {
  const store = getStore({ name: "frizzday-reminders", consistency: "strong" }), keys = await vapidKeys();
  webpush.setVapidDetails(SITE, keys.publicKey, keys.privateKey);
  const { blobs } = await store.list(); let sent = 0, removed = 0; const wx = new Map();
  for (const b of blobs) {
    try {
      const rec = await store.get(b.key, { type: "json" }); if (!rec) continue;
      const lp = localParts(rec.tz); if (lp.hour !== rec.hour || rec.lastSent === lp.date) continue;
      const k = `${rec.lat},${rec.lon}`;
      if (!wx.has(k)) { const r = await fetch(forecastURL(rec.lat, rec.lon)); wx.set(k, r.ok ? await r.json() : null); }
      const f = wx.get(k); if (!f) continue;
      const day = toDays(f).find(d => d.date === lp.date); if (!day) continue;
      const ds = dayScore(day, rec.hair, rec.porous, rec.bias); const L = level(ds.score);
      const payload = { title: `${EMOJI[L]} Frizz ${Math.round(ds.score)}/10 today${rec.name ? " in " + rec.name.split(",")[0] : ""}`, body: `${LEVEL_NAMES[L]}. ${verdict(ds, lp.date + rec.hair)} ${ds.window}.`, tag: "fd-" + lp.date, url: "/" };
      try { await webpush.sendNotification(rec.subscription, JSON.stringify(payload), { TTL: 3 * 3600, urgency: "high" }); sent++; await store.setJSON(b.key, { ...rec, lastSent: lp.date }); }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(b.key); removed++; } }
    } catch { /* keep going */ }
  }
  console.log(`FrizzDay: ${blobs.length} subscribers, ${sent} sent, ${removed} removed`);
};
export const config = { schedule: "0 * * * *" };
