// /api/remind — the morning frizz report.
//   GET -> { publicKey }
//   POST { action: "on", subscription, lat, lon, name, hair, porous, bias, hour, tz, confirm }   |   { action: "off", subscription }
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys, subId, SITE } from "../lib/push.mjs";
import { HAIR } from "../../public/engine.js";
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const validSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
const validTz = tz => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
export default async (req) => {
  const keys = await vapidKeys();
  if (req.method === "GET") return json({ publicKey: keys.publicKey });
  if (req.method !== "POST") return json({ error: "Use GET or POST" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Send JSON" }, 400); }
  if (!validSub(b.subscription)) return json({ error: "Missing subscription" }, 400);
  const store = getStore({ name: "frizzday-reminders", consistency: "strong" }), id = subId(b.subscription.endpoint);
  if (b.action === "off") { await store.delete(id); return json({ ok: true }); }
  if (!isFinite(b.lat) || !isFinite(b.lon) || Math.abs(b.lat) > 90 || Math.abs(b.lon) > 180) return json({ error: "Missing location" }, 400);
  const prev = await store.get(id, { type: "json" });
  const rec = {
    subscription: { endpoint: b.subscription.endpoint, keys: { p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth } },
    lat: +(+b.lat).toFixed(2), lon: +(+b.lon).toFixed(2), name: String(b.name || "").replace(/[<>\u0000-\u001f]/g, "").slice(0, 60),
    hair: HAIR[b.hair] ? b.hair : "wavy", porous: !!b.porous, bias: Math.max(-3, Math.min(3, +b.bias || 0)),
    hour: [5, 6, 7, 8, 9, 10].includes(+b.hour) ? +b.hour : 7, tz: validTz(b.tz) ? b.tz : "America/New_York",
    lastSent: prev?.lastSent || "", updated: Date.now()
  };
  await store.setJSON(id, rec);
  if (b.confirm) {
    webpush.setVapidDetails(SITE, keys.publicKey, keys.privateKey);
    try { await webpush.sendNotification(rec.subscription, JSON.stringify({ title: "You're on the frizz list 💁", body: `Your forecast lands every morning at ${rec.hour}:00 AM. Your hair will finally have a heads-up.`, tag: "fd-confirm", url: "/" }), { TTL: 3600 }); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(id); return json({ error: "expired" }, 410); } }
  }
  return json({ ok: true });
};
export const config = { path: "/api/remind" };
