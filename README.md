# FrizzDay

Will today be a frizz day? A daily hair forecast based on dew point and hair type. Live at https://frizzday.com

- `public/engine.js` — the frizz model (dew point curves by hair type and porosity, rain, wind, personal tuning). Shared by the app and the notification function.
- `public/app.js` — the app. Weather from Open-Meteo (free, no key); city search via Open-Meteo geocoding; "use my location" names the town via BigDataCloud's free reverse geocoder.
- `netlify/functions/remind.mjs` + `remind-send.mjs` — optional morning frizz report by web push, sent hourly to whoever's chosen hour it is in their own time zone. Keys are created automatically in Netlify Blobs.
- Deploy: Netlify → Import from Git → this repo. No settings needed.
- Release: bump `SHELL` in `public/sw.js`.
