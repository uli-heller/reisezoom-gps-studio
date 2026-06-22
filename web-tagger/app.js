/* Reisezoom Foto-Geotagger (Web) — JPEG-only, 100% client-seitig.
 *
 * Ablauf: GPX laden → Fotos (JPEG) laden → über Zeit matchen (Kamera-Zeitzone +
 * Fein-Offset) → Pins auf der Karte → GPS per piexifjs in die JPEGs schreiben +
 * herunterladen. Kein Server, kein Upload, kein Mapbox-Token/Kreditkarte (OSM).
 *
 * Bewusste Grenzen (siehe Desktop-App für mehr): nur GPX als Track, nur JPEG
 * schreiben (HEIC/RAW/Video brauchen ExifTool → Desktop). */

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────
  let track = [];          // [{lat, lon, ele, tMs}] sortiert nach Zeit (UTC)
  let photos = [];         // [{file, name, dtMs, make, model, hadGps, thumbUrl, match}]
  let map = null, mapReady = false;
  const markers = [];
  const MATCH_TOLERANCE_S = 1800;   // ±30 min wie die Desktop-App

  const $ = (id) => document.getElementById(id);

  // ── Zeitzonen-Dropdown ─────────────────────────────────────────────────────
  const TZ = [
    -12,-11,-10,-9,-8,-7,-6,-5,-4,-3.5,-3,-2,-1,0,1,2,3,3.5,4,4.5,5,5.5,5.75,6,6.5,7,8,9,9.5,10,11,12,13,14
  ];
  (function fillTz() {
    const sel = $("in-tz");
    for (const h of TZ) {
      const sign = h >= 0 ? "+" : "−";
      const ah = Math.abs(h);
      const hh = Math.floor(ah);
      const mm = Math.round((ah - hh) * 60);
      const label = `UTC ${sign}${hh}${mm ? ":" + String(mm).padStart(2, "0") : ""}`;
      const o = document.createElement("option");
      o.value = String(h); o.textContent = label;
      if (h === 0) o.selected = true;
      sel.appendChild(o);
    }
  })();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function tzOffsetSeconds() { return (parseFloat($("in-tz").value) || 0) * 3600; }

  // Offset-Parser wie Desktop: "4s" / "-2m" / "1h" / "90" (=Sekunden)
  function parseOffset(str) {
    if (!str) return 0;
    const m = String(str).trim().match(/^([+-]?\d+(?:\.\d+)?)\s*([smh]?)$/i);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    const u = (m[2] || "s").toLowerCase();
    return Math.round(v * (u === "h" ? 3600 : u === "m" ? 60 : 1));
  }

  // EXIF-DateTimeOriginal ("YYYY:MM:DD HH:MM:SS", lokale Kamera-Wandzeit) als
  // UTC-ms interpretiert (browser-TZ-unabhängig — Korrektur kommt über die
  // gewählte Kamera-Zeitzone).
  function exifDateToWallMs(s) {
    if (!s) return null;
    if (s instanceof Date) {
      // exifr kann ein Date liefern; in Wandzeit-Komponenten zurückrechnen
      return Date.UTC(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
    }
    const m = String(s).match(/(\d{4})\D(\d{2})\D(\d{2})\D+(\d{2})\D(\d{2})\D(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }

  function fmtClock(ms) {
    if (ms == null) return "—";
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }

  // ── GPX-Parsing ────────────────────────────────────────────────────────────
  function parseGpx(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("GPX ist nicht wohlgeformt.");
    const pts = [];
    const nodes = doc.getElementsByTagName("trkpt").length
      ? doc.getElementsByTagName("trkpt")
      : doc.getElementsByTagName("rtept");
    for (const n of nodes) {
      const lat = parseFloat(n.getAttribute("lat"));
      const lon = parseFloat(n.getAttribute("lon"));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const timeEl = n.getElementsByTagName("time")[0];
      const eleEl = n.getElementsByTagName("ele")[0];
      const tMs = timeEl ? Date.parse(timeEl.textContent.trim()) : NaN;
      pts.push({ lat, lon, ele: eleEl ? parseFloat(eleEl.textContent) : null, tMs });
    }
    return pts.filter(p => isFinite(p.tMs)).sort((a, b) => a.tMs - b.tMs);
  }

  // Nächster Track-Punkt per Zeit (binäre Suche).
  function nearestByTime(tMs) {
    if (!track.length) return null;
    let lo = 0, hi = track.length - 1;
    if (tMs <= track[0].tMs) { lo = hi = 0; }
    else if (tMs >= track[hi].tMs) { lo = hi; }
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (track[mid].tMs < tMs) lo = mid; else hi = mid;
      }
    }
    const a = track[lo], b = track[hi];
    const best = Math.abs(a.tMs - tMs) <= Math.abs(b.tMs - tMs) ? a : b;
    return { pt: best, dtS: Math.abs(best.tMs - tMs) / 1000 };
  }

  // ── Foto-Import ────────────────────────────────────────────────────────────
  async function readPhoto(file) {
    let dtMs = null, make = "", model = "", hadGps = false;
    try {
      const meta = await exifr.parse(file, { reviveValues: false, tiff: true, ifd0: true, exif: true, gps: false });
      dtMs = exifDateToWallMs(meta && (meta.DateTimeOriginal || meta.CreateDate || meta.DateTime));
      make = (meta && meta.Make) || "";
      model = (meta && meta.Model) || "";
    } catch (_) {}
    try {
      const g = await exifr.gps(file);
      hadGps = !!(g && isFinite(g.latitude) && isFinite(g.longitude));
    } catch (_) {}
    return {
      file, name: file.name, dtMs,
      make: String(make).trim(), model: String(model).trim(),
      hadGps, thumbUrl: URL.createObjectURL(file), match: null,
    };
  }

  // ── Matching ───────────────────────────────────────────────────────────────
  function recompute() {
    const tzS = tzOffsetSeconds();
    const offS = parseOffset($("in-offset").value);
    for (const p of photos) {
      p.match = null;
      if (p.dtMs == null || !track.length) continue;
      // Wandzeit → echte UTC: minus Zeitzone, minus Fein-Offset
      const utcMs = p.dtMs - tzS * 1000 - offS * 1000;
      const near = nearestByTime(utcMs);
      if (near && near.dtS <= MATCH_TOLERANCE_S) {
        p.match = { lat: near.pt.lat, lon: near.pt.lon, ele: near.pt.ele, dtS: near.dtS };
      }
    }
    renderList();
    renderSummary();
    renderMarkers();
  }

  // ── UI-Rendering ───────────────────────────────────────────────────────────
  function renderSummary() {
    const sum = $("summary"), act = $("actions"), btn = $("btn-write");
    if (!photos.length) { sum.hidden = true; act.hidden = true; return; }
    const matched = photos.filter(p => p.match).length;
    const noTime = photos.filter(p => p.dtMs == null).length;
    sum.hidden = false; act.hidden = false;
    btn.disabled = matched === 0;
    let html = `<b class="ok">${matched}</b> von ${photos.length} Fotos passen zum Track`;
    if (matched < photos.length) html += ` · <b class="warn">${photos.length - matched}</b> ohne Treffer`;
    if (noTime) html += ` · ${noTime} ohne Aufnahmezeit`;
    if (!track.length) html = "Lade zuerst einen GPX-Track.";
    sum.innerHTML = html;
  }

  function renderList() {
    const wrap = $("photolist");
    wrap.innerHTML = "";
    for (const p of photos) {
      const row = document.createElement("div");
      row.className = "prow " + (p.match ? "matched" : "nomatch");
      const cam = [p.make, p.model].filter(Boolean).join(" ") || "Unbekannte Kamera";
      let badge;
      if (p.match) badge = `<span class="pbadge ok">✓ ${p.match.dtS < 1 ? "exakt" : "±" + Math.round(p.match.dtS) + "s"}</span>`;
      else if (p.dtMs == null) badge = `<span class="pbadge no">keine Zeit</span>`;
      else badge = `<span class="pbadge no">kein Treffer</span>`;
      const had = p.hadGps ? ` <span class="pbadge had">hatte GPS</span>` : "";
      row.innerHTML = `
        <img class="pthumb" src="${p.thumbUrl}" alt="">
        <div class="pmeta">
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pinfo">${escapeHtml(cam)} · ${fmtClock(p.dtMs)}</div>
        </div>
        ${badge}${had}`;
      wrap.appendChild(row);
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ── Karte ──────────────────────────────────────────────────────────────────
  function initMap() {
    if (map) return;
    map = new maplibregl.Map({
      container: "map",
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256, attribution: "© OpenStreetMap-Mitwirkende",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [10, 51], zoom: 3, attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      mapReady = true;
      map.addSource("track", { type: "geojson", data: trackGeoJson() });
      map.addLayer({ id: "track", type: "line", source: "track",
        paint: { "line-color": "#ff7a18", "line-width": 3.2, "line-opacity": 0.85 } });
      renderMarkers(); fitToData();
    });
  }

  function trackGeoJson() {
    return { type: "Feature", geometry: { type: "LineString", coordinates: track.map(p => [p.lon, p.lat]) } };
  }

  function renderMarkers() {
    if (!mapReady) return;
    while (markers.length) markers.pop().remove();
    for (const p of photos) {
      if (!p.match) continue;
      const el = document.createElement("div"); el.className = "gt-pin";
      const mk = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.match.lon, p.match.lat])
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false })
          .setHTML(`<b>${escapeHtml(p.name)}</b><br>${p.match.lat.toFixed(5)}, ${p.match.lon.toFixed(5)}`))
        .addTo(map);
      markers.push(mk);
    }
    $("map-empty").hidden = !!(track.length || photos.length);
  }

  function fitToData() {
    if (!mapReady) return;
    const coords = [];
    for (const p of track) coords.push([p.lon, p.lat]);
    for (const p of photos) if (p.match) coords.push([p.match.lon, p.match.lat]);
    if (!coords.length) return;
    const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 600 });
  }

  function refreshTrackLayer() {
    if (mapReady && map.getSource("track")) map.getSource("track").setData(trackGeoJson());
  }

  // ── GPS in JPEG schreiben (piexifjs) ───────────────────────────────────────
  function decToDmsRationals(dec) {
    dec = Math.abs(dec);
    const d = Math.floor(dec);
    const mFloat = (dec - d) * 60;
    const m = Math.floor(mFloat);
    const s = Math.round((mFloat - m) * 60 * 10000);
    return [[d, 1], [m, 1], [s, 10000]];
  }

  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function writeGpsIntoJpeg(dataUrl, lat, lon, ele) {
    let exifObj;
    try { exifObj = piexif.load(dataUrl); }
    catch (_) { exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {}, "thumbnail": null }; }
    const G = piexif.GPSIFD;
    const gps = {};
    gps[G.GPSVersionID] = [2, 3, 0, 0];
    gps[G.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
    gps[G.GPSLatitude] = decToDmsRationals(lat);
    gps[G.GPSLongitudeRef] = lon >= 0 ? "E" : "W";
    gps[G.GPSLongitude] = decToDmsRationals(lon);
    if (ele != null && isFinite(ele)) {
      gps[G.GPSAltitudeRef] = ele < 0 ? 1 : 0;
      gps[G.GPSAltitude] = [Math.round(Math.abs(ele) * 100), 100];
    }
    exifObj.GPS = gps;
    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, dataUrl);  // → neue Daten-URL (JPEG mit GPS)
  }

  async function writeAll() {
    const btn = $("btn-write");
    const todo = photos.filter(p => p.match);
    if (!todo.length) return;
    btn.disabled = true;
    let done = 0;
    for (const p of todo) {
      try {
        const dataUrl = await fileToDataURL(p.file);
        const tagged = writeGpsIntoJpeg(dataUrl, p.match.lat, p.match.lon, p.match.ele);
        const blob = await (await fetch(tagged)).blob();
        triggerDownload(blob, geotaggedName(p.name));
        done++;
        btn.textContent = `📍 Schreibe… ${done}/${todo.length}`;
        await sleep(120);   // Browser-Download-Drossel
      } catch (e) {
        console.error("Tagging fehlgeschlagen für", p.name, e);
      }
    }
    btn.textContent = `✓ ${done} Foto(s) getaggt & heruntergeladen`;
    setTimeout(() => { btn.textContent = "📍 GPS in JPEGs schreiben & herunterladen"; btn.disabled = false; }, 2600);
  }

  function geotaggedName(name) {
    const i = name.lastIndexOf(".");
    return i < 0 ? name + "_geotagged" : name.slice(0, i) + "_geotagged" + name.slice(i);
  }
  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Datei-Eingabe (Klick + Drag&Drop) ──────────────────────────────────────
  async function onGpxFiles(files) {
    const f = files && files[0]; if (!f) return;
    try {
      const text = await f.text();
      track = parseGpx(text);
      if (!track.length) { alert("Im GPX wurden keine Punkte mit Zeitstempel gefunden."); return; }
      const lbl = $("gpx-label");
      lbl.textContent = `✓ ${f.name} — ${track.length} Punkte (${fmtClock(track[0].tMs)} → ${fmtClock(track[track.length - 1].tMs)} UTC)`;
      $("drop-gpx").classList.add("loaded");
      initMap(); refreshTrackLayer(); recompute(); fitToData();
    } catch (e) { alert("GPX konnte nicht gelesen werden: " + e.message); }
  }

  async function onPhotoFiles(files) {
    const list = Array.from(files || []).filter(f => /jpe?g$/i.test(f.name) || f.type === "image/jpeg");
    if (!list.length) { alert("Bitte JPEG-Dateien wählen (für RAW/HEIC die Desktop-App)."); return; }
    $("photos-label").textContent = `Lese ${list.length} Foto(s)…`;
    const fresh = [];
    for (const f of list) fresh.push(await readPhoto(f));
    photos = photos.concat(fresh);
    $("photos-label").textContent = `✓ ${photos.length} Foto(s) geladen`;
    $("drop-photos").classList.add("loaded");
    initMap(); recompute();
  }

  function wireDrop(dropId, inputId, handler) {
    const drop = $(dropId), input = $(inputId);
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => { handler(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files) handler(e.dataTransfer.files); });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  wireDrop("drop-gpx", "in-gpx", onGpxFiles);
  wireDrop("drop-photos", "in-photos", onPhotoFiles);
  $("in-tz").addEventListener("change", recompute);
  $("in-offset").addEventListener("input", debounce(recompute, 250));
  $("btn-write").addEventListener("click", writeAll);

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // für Tests/Headless-Verifikation exponieren
  window.__rzTagger = { parseGpx, parseOffset, exifDateToWallMs, decToDmsRationals, writeGpsIntoJpeg, nearestByTime,
    get track() { return track; }, get photos() { return photos; } };
})();
