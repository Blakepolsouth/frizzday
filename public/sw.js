// FrizzDay service worker: works offline with the last forecast, fresh code when online, morning notifications.
const SHELL = "frizzday-v1";
const FILES = ["/", "/style.css", "/app.js", "/engine.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SHELL).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const key = req.mode === "navigate" ? "/" : req;
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then(x => x.put(key, c)); } return r; }).catch(() => caches.match(key)));
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "FrizzDay", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "FrizzDay", { body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || "frizzday", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close(); const target = e.notification.data?.url || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => { for (const c of list) if ("focus" in c && c.url.startsWith(self.location.origin)) { c.navigate(target); return c.focus(); } return self.clients.openWindow(target); }));
});
