/* FrizzDay engine. Shared by the app and the morning-notification function.
   The science: frizz is driven by dew point (how much water is actually in the air), not relative humidity.
   Hair absorbs water vapor, the cuticle swells unevenly, strands kink: frizz. Very dry air causes static and
   flyaways, and makes curly/coily hair dry and crunchy. Each hair type reacts differently. */

export const HAIR = {
  straight: { label: "Straight", humid: 0.78, dry: 0.45, wet: "flat, limp, with a frizzy halo", dryWord: "static and flyaways" },
  wavy:     { label: "Wavy",     humid: 1.0,  dry: 0.35, wet: "frizz and waves that fall out", dryWord: "flyaways" },
  curly:    { label: "Curly",    humid: 1.0,  dry: 0.6,  wet: "frizz and lost definition", dryWord: "dry, crunchy curls" },
  coily:    { label: "Coily",    humid: 0.9,  dry: 0.85, wet: "frizz and shrinkage", dryWord: "dryness and breakage risk" }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* One hour's frizz score, 0-10. bias = personal tuning (+ = your hair frizzes earlier than average). */
export function hourScore(h, hair = "wavy", porous = false, bias = 0) {
  const H = HAIR[hair] || HAIR.wavy, td = h.dew;
  const humid = clamp((td - 45 + bias * 2.5) / 25, 0, 1) * H.humid * (porous ? 1.12 : 1);   // 45°F dew point: fine. 70°F: peak frizz.
  const dry = clamp((38 - td) / 28, 0, 1) * H.dry * (porous ? 1.1 : 1);                       // under ~38°F dew point: static / dryness
  let s = 10 * Math.max(humid, dry);
  if (h.rain >= 50) s += 1.5; else if (h.rain >= 30) s += 0.6;                                 // rain or drizzle on the way
  if (h.wind >= 18) s += 1; else if (h.wind >= 12) s += 0.5;                                    // wind = tangles and puff
  return { score: clamp(Math.round(s * 10) / 10, 0, 10), kind: dry > humid ? "dry" : "humid" };
}

/* Parse an Open-Meteo hourly forecast into days of hours (local time strings) */
export function toDays(f) {
  const hr = f.hourly, days = {};
  hr.time.forEach((t, i) => {
    const d = t.slice(0, 10), hour = +t.slice(11, 13);
    (days[d] = days[d] || []).push({ t, hour, dew: hr.dew_point_2m[i], rh: hr.relative_humidity_2m[i], temp: hr.temperature_2m[i], rain: hr.precipitation_probability?.[i] ?? 0, wind: hr.wind_speed_10m?.[i] ?? 0 });
  });
  return Object.entries(days).map(([date, hours]) => ({ date, hours }));
}

/* The day's score: weighted toward the hours your hair is out in the world (8 AM - 8 PM) */
export function dayScore(day, hair, porous, bias) {
  const hrs = day.hours.filter(h => h.hour >= 8 && h.hour <= 20).map(h => ({ ...h, ...hourScore(h, hair, porous, bias) }));
  if (!hrs.length) return null;
  const peak = Math.max(...hrs.map(h => h.score)), avg = hrs.reduce((a, h) => a + h.score, 0) / hrs.length;
  const score = Math.round((peak * 0.6 + avg * 0.4) * 10) / 10;
  const dryHours = hrs.filter(h => h.kind === "dry" && h.score >= 3).length;
  const kind = dryHours > hrs.length / 2 ? "dry" : "humid";
  // Best window: from the morning, how long until it crosses 6 (or crosses back under)
  const bad = hrs.find(h => h.hour >= 9 && h.score >= 6.5);
  const goodAll = hrs.every(h => h.score < 5);
  const window = goodAll ? "Good all day" : bad && bad.hour > 9 ? `Holds until about ${fmtHour(bad.hour)}` : bad ? "Rough from the start" : "Mostly manageable";
  const dewMax = Math.max(...hrs.map(h => h.dew)), dewMin = Math.min(...hrs.map(h => h.dew)), rainMax = Math.max(...hrs.map(h => h.rain));
  return { score, peak, avg, kind, window, hours: hrs, dewMax, dewMin, rainMax };
}

export const fmtHour = h => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
export const level = s => s < 2.5 ? 0 : s < 4.5 ? 1 : s < 6.5 ? 2 : s < 8.5 ? 3 : 4;
export const LEVEL_NAMES = ["Great hair day", "Pretty good", "Iffy", "Frizz day", "Full frizz"];

/* The one-liner. A little humor, always useful. */
const LINES = {
  humid: [
    ["Great hair day. Wear it down, you've earned it.", "Hair weather is on your side today.", "Zero frizz drama. Go wild."],
    ["Pretty good. A little serum and you're set.", "Mostly smooth. Light hold should do it.", "Good day, just don't skip the leave-in."],
    ["Iffy. It'll start strong and get ideas by afternoon.", "Coin flip. Bring backup (a clip).", "Your hair will be fine. Mostly. Probably."],
    ["Frizz day. Strong hold or a cute updo.", "It's a ponytail kind of day.", "The air is basically soup. Plan accordingly."],
    ["Full frizz. Braid it, bun it, or embrace the volume.", "Don't fight it today. Hat. Scarf. Bun.", "10 out of 10 frizz. Even your frizz has frizz."]
  ],
  dry: [
    ["Great hair day. Nice and balanced.", "Comfortable air. Your hair is happy.", "Good day. Moisture in, nothing to fight."],
    ["Pretty good. A touch of oil keeps flyaways down.", "Slightly dry. Leave-in and you're fine.", "Mostly good, a little static possible."],
    ["Dry air. Expect static and flyaways.", "Static-cling weather. Moisturize the ends.", "Dry day. Your hair will want a drink."],
    ["Very dry. Seal in moisture or it'll get crunchy.", "Static city. Skip the wool hat if you can.", "Dry and staticky. Heavier cream today."],
    ["Desert-level dry. Deep moisture and protective styles.", "Max static. Your hair could power a lightbulb.", "Extremely dry. Be gentle, moisturize everything."]
  ]
};
export function verdict(ds, seedDate = "") {
  const L = level(ds.score), arr = LINES[ds.kind][L]; let h = 0; for (const c of seedDate) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

/* Tips by hair type and conditions */
export function tips(ds, hair) {
  const L = level(ds.score), dry = ds.kind === "dry", t = [];
  const H = { straight: 0, wavy: 1, curly: 2, coily: 3 }[hair] ?? 1;
  if (dry && L >= 2) {
    t.push(["Moisture first", H >= 2 ? "Layer leave-in, then cream or oil (the LOC method) to keep curls from drying out." : "A light oil or anti-static spray on the ends tames flyaways."]);
    t.push(["Skip the static", "Silk or satin scarf, and go easy on wool hats and synthetic scarves."]);
    if (H >= 2) t.push(["Protect it", "Twists, braids or a pineapple at night keep moisture in."]);
    else t.push(["Easy on heat", "Dry air plus hot tools is a fast track to breakage. Lower the heat."]);
  } else if (L >= 3) {
    t.push(["Anti-humidity hold", H >= 2 ? "Gel or mousse on soaking-wet hair, let it dry into a cast, then scrunch out the crunch. Don't touch it after." : "Anti-humidity spray or a smoothing serum with silicone seals out moisture."]);
    t.push(["Style that works with it", H === 0 ? "Sleek ponytail, low bun or claw clip. Straightening today is a losing battle." : "Braids, a bun or a claw clip. Today, volume is a feature."]);
    t.push(["Pack backup", "A clip, scrunchie or travel-size serum for the afternoon rescue."]);
  } else if (L === 2) {
    t.push(["Light protection", H >= 2 ? "Medium-hold gel and a little oil on the ends." : "A smoothing cream or light serum, focused on the ends."]);
    t.push(["Hands off", "The more you touch it, the more it frizzes. Style it and leave it."]);
  } else {
    t.push(["Wear it down", H >= 2 ? "Wash-and-go weather. Define and let it be." : "Blowout weather. It'll actually last."]);
    t.push(["Keep it simple", "Your usual routine is all you need today."]);
  }
  if (ds.rainMax >= 50) t.push(["Rain later", `${ds.rainMax}% chance of rain. Pack a hood or umbrella.`]);
  return t.slice(0, 3);
}

/* Personal tuning: each nightly rating nudges your bias. Returns the new bias. */
export function tune(bias, scoreThatDay, rating) {
  // rating: 1 great, 2 okay, 3 frizzed
  let b = bias;
  if (rating === 3 && scoreThatDay < 6) b += 0.6 * (6 - scoreThatDay) / 6 + 0.3;
  if (rating === 1 && scoreThatDay > 4) b -= 0.6 * (scoreThatDay - 4) / 6 + 0.3;
  if (rating === 2 && scoreThatDay >= 7.5) b -= 0.25;
  if (rating === 2 && scoreThatDay <= 2.5) b += 0.25;
  return clamp(Math.round(b * 100) / 100, -3, 3);
}
/* The dew point where YOUR hair starts frizzing (score crosses 5) */
export function frizzPoint(hair, porous, bias) {
  for (let td = 30; td <= 80; td++) if (hourScore({ dew: td, rain: 0, wind: 0 }, hair, porous, bias).score >= 5 && td > 40) return td;
  return 80;
}

export const forecastURL = (lat, lon) => `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=dew_point_2m,relative_humidity_2m,temperature_2m,precipitation_probability,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=4`;
