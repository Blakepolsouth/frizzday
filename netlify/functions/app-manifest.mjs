// /app.webmanifest?s=<code> — the app manifest, but the Home Screen app starts with this phone's hair settings.
// (iPhone keeps Home Screen apps' storage separate from Safari, so this is how someone's setup comes along when they install.)
const base = { name: "FrizzDay", short_name: "FrizzDay", description: "Your hair's daily forecast.", id: "/", scope: "/", display: "standalone", background_color: "#fbf3ef", theme_color: "#fbf3ef",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }; // keep in sync with public/manifest.webmanifest
export default async (req) => {
  const s = new URL(req.url).searchParams.get("s") || "";
  const ok = /^[A-Za-z0-9_-]{1,3000}$/.test(s);
  return new Response(JSON.stringify({ ...base, start_url: ok ? `/?restore=${s}` : "/" }), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } });
};
export const config = { path: "/app.webmanifest" };
