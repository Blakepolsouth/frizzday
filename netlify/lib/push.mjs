import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { createHash } from "node:crypto";
export async function vapidKeys() {
  const cfg = getStore({ name: "frizzday-config", consistency: "strong" });
  let keys = await cfg.get("vapid", { type: "json" });
  if (!keys || !keys.publicKey) { const fresh = webpush.generateVAPIDKeys(); await cfg.setJSON("vapid", fresh); keys = (await cfg.get("vapid", { type: "json" })) || fresh; }
  return keys;
}
export const subId = e => createHash("sha256").update(e).digest("hex").slice(0, 32);
export const SITE = "https://frizzday.com";
