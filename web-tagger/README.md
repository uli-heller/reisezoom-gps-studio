# Reisezoom Foto-Geotagger (Web)

Statisches Browser-Tool, das **JPEG**-Fotos mit GPS aus einem **GPX**-Track taggt —
**komplett client-seitig**. Fotos und Track werden **nicht hochgeladen**, es gibt
keinen Server und keinen Mapbox-Token (Karte über OpenStreetMap).

## Dateien
- `index.html` — UI (lädt exifr, piexifjs, MapLibre GL per CDN)
- `app.js` — Logik (GPX-Parse, Zeit-Match, GPS-Schreiben via piexifjs)
- `style.css` — Styling (Schrift: Nunito + System-Fallback)

## Lokal testen
```bash
cd web-tagger
python3 -m http.server 8080
# → http://localhost:8080
```
(GPX laden → JPEGs laden → Zeitzone/Offset → „GPS in JPEGs schreiben")

## Deploy
Reine statische Dateien — einfach in ein Verzeichnis hochladen, z. B.
`reisezoom.com/.../tagger/` bzw. `gps-studio.reisezoom.com/tagger`.
Keine Build-Schritte, keine Secrets, keine Server-Konfig.

## Bewusste Grenzen (= Upsell zur Desktop-App)
- Schreibt nur **JPEG**-GPS (HEIC/RAW/Video brauchen ExifTool → Desktop-App).
- Track nur als **GPX** (FIT/TCX/KML konvertiert die Desktop-App).
- Kein In-place-Überschreiben (Browser) → es entsteht eine `…_geotagged.jpg`-Kopie.

## Tests
`tests/test_web_tagger.py` (Playwright, headless): echtes JPEG + GPX → Zeit-Match →
GPS geschrieben + wieder ausgelesen.

## Lizenzen / Credits
- [exifr](https://github.com/MikeKovarik/exifr) (MIT) — EXIF lesen
- [piexifjs](https://github.com/hMatoba/piexifjs) (MIT) — EXIF/GPS schreiben
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) (BSD-3) — Karte
- Karten-Tiles © OpenStreetMap-Mitwirkende (ODbL)
