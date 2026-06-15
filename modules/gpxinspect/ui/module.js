// Reisezoom GPS Studio — GPX-Inspektor-Modul (v0.9.233)
// Marc-Idee + Nutzer-Bug-Report (c): Track Punkt-für-Punkt zeigen und „heilen".
// Phase 1: alle Punkte auf der Karte, 2 Anker wählen → Heilen (Sprung glätten,
// Position+Höhe interpolieren, Zeit behalten → Speed korrigiert sich selbst)
// ODER Lücke füllen (neue Punkte mit interpolierter Position/Höhe/Zeit einfügen).
// Editierter Track wird als <name>_geheilt.gpx gespeichert.

(window.RZGPS_MODULES = window.RZGPS_MODULES || {}).gpxinspect = {
  manifest: {
    slug: "gpxinspect",
    name: "GPX-Inspektor",
    description: "Track heilen",
    icon: "🔍",
    sort_order: 60,
  },
  mount: function (body, headerActions) { return mountGpxInspect(body, headerActions); },
};

function mountGpxInspect(body, headerActions) {
  let map = null;
  let isUnmounted = false;
  let _points = [];        // editierbare Kopie: [{lat,lon,ele,time}]
  let _srcPath = null;
  let _hasTime = false, _hasEle = false;
  let _selA = null, _selB = null;   // Anker-Indizes (a <= b)
  let _dirty = false;
  let _drawMode = false;            // Pfad-zeichnen-Modus aktiv?
  let _drawPts = [];                // selbst gesetzte Stützpunkte [{lat,lon}]
  // v0.9.239 — Auto-Despike: erkannte Ausreißer-Gruppen + Navigations-State.
  let _spikes = [];                 // [{a,b,from,to}] a=Anker vor, b=Anker nach
  let _spikeSet = new Set();        // Punkt-Indizes die als Ausreißer markiert sind
  let _spikeIdx = -1;               // aktuell anvisierter Ausreißer (für Navigation)
  let _despikeRan = false;          // wurde schon mind. 1× gesucht? (Slider live-Update)
  let _dragging = false;            // ziehe gerade den ausgewählten Punkt? (v0.9.243)
  let _dragMoved = false;           // hat sich beim Ziehen wirklich was bewegt?

  // v0.9.238 — Undo/Redo (Cmd+Z / Cmd+Shift+Z) für ALLE Track-Edits.
  // Snapshot/Restore auf der kompletten _points-Liste. Vor jeder Operation
  // wird der Stand gepusht (force, kein Throttle — jede Aktion ist diskret).
  const _undo = (typeof window.createUndoController === "function") ? window.createUndoController({
    snapshot: () => ({ points: JSON.parse(JSON.stringify(_points)), dirty: _dirty }),
    apply: (snap) => {
      _points = JSON.parse(JSON.stringify((snap && snap.points) || []));
      _dirty = !!(snap && snap.dirty);
      _selA = _selB = null; _drawMode = false; _drawPts = [];
      clearSpikes();
      renderAll(); renderDraw(); updateUI();
    },
    toast: (m) => { try { toast(m, "info", 1000); } catch (_) {} },
    throttleMs: 0,
  }) : null;
  if (_undo) window.__rzUndoControllers.gpxinspect = _undo;
  function _pushUndo(label) { if (_undo) _undo.push(label, { force: true }); }

  body.innerHTML = `
    <div class="panel gpxi-side">
        <div class="gpxi-empty" id="gpxi-empty">${t("gpxinspect.empty", "Lade ein GPX über die Leiste oben — dann erscheint hier jeder einzelne Track-Punkt.")}</div>
        <div class="gpxi-panel" id="gpxi-panel" hidden>
          <div class="gpxi-stat" id="gpxi-stat"></div>
          <p class="gpxi-help">${t("gpxinspect.help", "Klick nacheinander zwei Punkte auf der Karte (Anker A grün, B rot). Dann wähle eine Aktion für den Abschnitt dazwischen.")}</p>
          <div class="gpxi-sel" id="gpxi-sel">${t("gpxinspect.sel_none", "Keine Auswahl")}</div>
          <button class="btn gpxi-act" id="gpxi-heal" disabled
            title="${t("gpxinspect.heal_tip", "Die Punkte zwischen A und B auf die direkte Linie legen (Position + Höhe interpoliert). Zeitstempel bleiben → Geschwindigkeit wird wieder realistisch.")}">
            🩹 ${t("gpxinspect.heal", "Heilen (Sprung glätten)")}</button>
          <button class="btn gpxi-act" id="gpxi-fill" disabled
            title="${t("gpxinspect.fill_tip", "Zwischen A und B neue Punkte einfügen (Position, Höhe und Zeit interpoliert) — füllt Lücken/Sprünge mit sauberen Zwischenpunkten.")}">
            ➕ ${t("gpxinspect.fill", "Lücke füllen (Luftlinie)")}</button>
          <button class="btn gpxi-act" id="gpxi-drawfill" disabled
            title="${t("gpxinspect.drawfill_tip", "Pfad zwischen A und B selbst auf der Karte zeichnen (Stützpunkte klicken). Wird mit Position, Höhe und Zeit aufgefüllt.")}">
            ✏️ ${t("gpxinspect.drawfill", "Pfad zeichnen & füllen")}</button>
          <div class="gpxi-drawbox" id="gpxi-drawbox" hidden>
            <div class="gpxi-drawhint" id="gpxi-drawhint"></div>
            <button class="btn btn-primary gpxi-act" id="gpxi-draw-apply" disabled>✓ ${t("gpxinspect.draw_apply", "Pfad übernehmen")}</button>
            <button class="btn gpxi-act" id="gpxi-draw-undo" disabled>⤺ ${t("gpxinspect.draw_undo", "Letzten Punkt zurück")}</button>
            <button class="btn gpxi-act" id="gpxi-draw-cancel">✕ ${t("gpxinspect.draw_cancel", "Zeichnen abbrechen")}</button>
          </div>
          <button class="btn gpxi-act gpxi-del" id="gpxi-delete-one" disabled
            title="${t("gpxinspect.delete_one_tip", "Den ausgewählten Punkt (Anker A) entfernen. Geht auch mit Entf/Backspace.")}">
            🗑 ${t("gpxinspect.delete_one", "Diesen Punkt löschen")}</button>
          <button class="btn gpxi-act gpxi-del" id="gpxi-delete" disabled
            title="${t("gpxinspect.delete_tip", "Die Punkte zwischen A und B ganz entfernen.")}">
            🗑 ${t("gpxinspect.delete", "Punkte dazwischen löschen")}</button>
          <button class="btn gpxi-clear" id="gpxi-clearsel" disabled>${t("gpxinspect.clear_sel", "Auswahl aufheben")}</button>
          <div class="gpxi-undorow">
            <button class="btn" id="gpxi-undo" disabled title="⌘Z">↩︎ ${t("gpxinspect.undo", "Rückgängig")}</button>
            <button class="btn" id="gpxi-redo" disabled title="⌘⇧Z">↪︎ ${t("gpxinspect.redo", "Wiederherstellen")}</button>
          </div>
          <hr class="gpxi-hr">
          <div class="gpxi-mm-title">${t("gpxinspect.mm_title", "🛣 Auf Straße/Weg matchen")}</div>
          <div class="gpxi-fillrow">
            <label>${t("gpxinspect.mm_profile", "Profil")}</label>
            <select id="gpxi-mm-profile">
              <option value="walking">${t("gpxinspect.mm_walking", "Zu Fuß / Wandern")}</option>
              <option value="cycling">${t("gpxinspect.mm_cycling", "Fahrrad")}</option>
              <option value="driving">${t("gpxinspect.mm_driving", "Auto")}</option>
            </select>
          </div>
          <button class="btn gpxi-act" id="gpxi-match-sel" disabled
            title="${t("gpxinspect.match_sel_tip", "Findet die echte Straßen-/Wege-Route zwischen Anker A und B (Directions). Robust gegen GPS-Drift — kein 50-m-Limit.")}">
            🛣 ${t("gpxinspect.match_sel", "Strecke A→B (Straße folgen)")}</button>
          <div class="gpxi-note muted">${t("gpxinspect.match_sel_hint", "Für einen Abschnitt, der einem Weg folgt: A und B setzen, dann die Route dazwischen suchen lassen.")}</div>
          <div class="gpxi-fillrow gpxi-sensrow" title="${t("gpxinspect.mm_radius_tip", "Wie weit vom Weg entfernt noch gesnappt wird. Klein = nur sehr nah am Weg, groß = fängt mehr GPS-Drift, snapt aber eher auf parallele Wege. (Mapbox-Max 50 m.) Gilt für den ganzen Track.")}">
            <label>${t("gpxinspect.mm_radius", "Snap-Radius (ganzer Track)")}</label>
            <input type="range" id="gpxi-mm-radius" min="5" max="50" step="5" value="25">
            <span id="gpxi-mm-radius-val" class="gpxi-sensval">25 m</span>
          </div>
          <button class="btn gpxi-act" id="gpxi-match-all"
            title="${t("gpxinspect.match_all_tip", "Den GANZEN Track auf das Wegenetz snappen (Map Matching, Radius oben). Nur bei weg-/straßenbasierten Tracks sinnvoll — bei Querfeldein-Wanderungen kann es die Spur verfälschen.")}">
            🛣 ${t("gpxinspect.match_all", "Ganzen Track snappen")}</button>
          <div class="gpxi-note muted">${t("gpxinspect.match_hint", "Nur sinnvoll, wenn der Track Wegen/Straßen folgt. Braucht Internet + Mapbox-Token.")}</div>
          <hr class="gpxi-hr">
          <button class="btn gpxi-act" id="gpxi-despike"
            title="${t("gpxinspect.despike_tip", "Durchsucht den ganzen Track automatisch nach GPS-Ausreißern (Punkte, die wegspringen und zurückkommen) und markiert sie. Du kannst durchsteppen oder alle auf einmal heilen.")}">
            🔎 ${t("gpxinspect.despike", "Ausreißer automatisch finden")}</button>
          <div class="gpxi-fillrow gpxi-sensrow" title="${t("gpxinspect.sens_tip", "Wie empfindlich nach Ausreißern gesucht wird. Niedrig = nur krasse Sprünge, hoch = auch kleine Zacken. Während du ziehst, aktualisiert sich die Markierung.")}">
            <label>${t("gpxinspect.sens", "Empfindlichkeit")}</label>
            <input type="range" id="gpxi-sens" min="1" max="10" step="1" value="5">
            <span id="gpxi-sens-val" class="gpxi-sensval">5</span>
          </div>
          <div class="gpxi-spikebox" id="gpxi-spikebox" hidden>
            <div class="gpxi-spikehint" id="gpxi-spikehint"></div>
            <div class="gpxi-spikenav">
              <button class="btn" id="gpxi-spike-prev" title="${t("gpxinspect.spike_prev", "Voriger")}">‹</button>
              <button class="btn" id="gpxi-spike-next" title="${t("gpxinspect.spike_next", "Nächster")}">${t("gpxinspect.spike_next", "Nächster")} ›</button>
            </div>
            <button class="btn btn-primary gpxi-act" id="gpxi-spike-healall">🩹 ${t("gpxinspect.spike_healall", "Alle heilen")}</button>
            <button class="btn gpxi-clear" id="gpxi-spike-clear">${t("gpxinspect.spike_clear", "Markierung entfernen")}</button>
          </div>
          <hr class="gpxi-hr">
          <div class="gpxi-fillrow">
            <label>${t("gpxinspect.spacing", "Abstand beim Füllen")}</label>
            <input type="number" id="gpxi-spacing" min="2" max="500" step="1" value="20"> m
          </div>
          <hr class="gpxi-hr">
          <button class="btn btn-primary" id="gpxi-save" disabled>💾 ${t("gpxinspect.save", "Geheiltes GPX speichern")}</button>
          <button class="btn gpxi-reset" id="gpxi-reset" disabled>↩︎ ${t("gpxinspect.reset", "Änderungen verwerfen")}</button>
          <div class="gpxi-note muted" id="gpxi-note"></div>
        </div>
    </div>
    <section class="canvas"><div id="gpxi-canvas"></div></section>
  `;

  // ── Map ──────────────────────────────────────────────────────────────────
  whenApiReady().then(async () => {
    if (isUnmounted) return;
    let made;
    try {
      made = createMap({
        container: "gpxi-canvas",
        mapboxStyle: "mapbox://styles/mapbox/outdoors-v12",
        common: { center: [10, 51], zoom: 4 },
      });
    } catch (e) {
      applog && applog("error", "[gpxinspect] createMap warf: " + e);
      return;
    }
    map = made.map;
    try { map.addControl(new made.lib.NavigationControl(), "top-right"); } catch (_) {}
    onMapReady(map, () => {
      if (isUnmounted) return;
      // Falls die Karte bei 0-Größe erzeugt wurde (Layout noch nicht fertig):
      try { map.resize(); } catch (_) {}
      const emptyLine = { type: "Feature", geometry: { type: "LineString", coordinates: [] } };
      const emptyFC = { type: "FeatureCollection", features: [] };
      try {
        map.addSource("gpxi-line", { type: "geojson", data: emptyLine });
        map.addLayer({ id: "gpxi-line-lyr", type: "line", source: "gpxi-line",
          paint: { "line-color": "#3aa0ff", "line-width": 2.4, "line-opacity": 0.85 } });
        map.addSource("gpxi-pts", { type: "geojson", data: emptyFC });
        map.addLayer({ id: "gpxi-pts-lyr", type: "circle", source: "gpxi-pts", paint: {
          // Zoom-Interpolate MUSS oben stehen (Mapbox erlaubt kein zoom-interpolate
          // innerhalb eines case) — die Spike-Vergrößerung steckt im Output pro Stop.
          "circle-radius": ["interpolate", ["linear"], ["zoom"],
            9,  ["case", ["boolean", ["get", "spike"], false], 4,  2.2],
            14, ["case", ["boolean", ["get", "spike"], false], 7,  4.5],
            18, ["case", ["boolean", ["get", "spike"], false], 10, 7]],
          "circle-color": ["case",
            ["==", ["get", "sel"], "a"], "#22c55e",
            ["==", ["get", "sel"], "b"], "#ef4444",
            ["boolean", ["get", "spike"], false], "#f59e0b",
            "#cfe6ff"],
          "circle-stroke-width": ["case",
            ["boolean", ["get", "spike"], false], 2.4,
            ["boolean", ["get", "anchor"], false], 2.2, 0.6],
          "circle-stroke-color": ["case",
            ["==", ["get", "sel"], "a"], "#0a7a32",
            ["==", ["get", "sel"], "b"], "#a11",
            ["boolean", ["get", "spike"], false], "#7c4a02",
            "#1f6fc4"],
        } });
        // v0.9.237 — Pfad-Zeichnen: Preview-Linie A→Stützpunkte→B + Stützpunkt-Marker.
        map.addSource("gpxi-draw", { type: "geojson", data: emptyLine });
        map.addLayer({ id: "gpxi-draw-lyr", type: "line", source: "gpxi-draw",
          paint: { "line-color": "#ff9f1c", "line-width": 2.6, "line-dasharray": [2, 1.4], "line-opacity": 0.95 } });
        map.addSource("gpxi-draw-pts", { type: "geojson", data: emptyFC });
        map.addLayer({ id: "gpxi-draw-pts-lyr", type: "circle", source: "gpxi-draw-pts", paint: {
          "circle-radius": 5.5, "circle-color": "#ff9f1c",
          "circle-stroke-width": 2, "circle-stroke-color": "#fff",
        } });
      } catch (e) { applog && applog("warn", "[gpxinspect] layer add: " + e); }
      map.on("click", "gpxi-pts-lyr", onPointClick);
      // Allgemeiner Karten-Klick: im Zeichnen-Modus = Stützpunkt setzen.
      map.on("click", onMapClickDraw);
      // Ausgewählten Punkt (Anker A, Einzel-Auswahl) per Drag verschieben (v0.9.243).
      map.on("mousedown", "gpxi-pts-lyr", onPointMouseDown);
      map.on("mousemove", onDragMove);
      map.on("mouseup", onDragEnd);
      map.on("mouseenter", "gpxi-pts-lyr", (e) => {
        if (_drawMode) { _setCursor("crosshair"); return; }   // Zeichnen-Modus: Fadenkreuz behalten
        const f = e.features && e.features[0];
        const grab = f && _selB === null && f.properties.i === _selA;
        _setCursor(grab ? "grab" : "pointer");
      });
      map.on("mouseleave", "gpxi-pts-lyr", () => {
        if (_drawMode) { _setCursor("crosshair"); return; }
        if (!_dragging) _setCursor("");
      });
      // Schon ein globales GPX geladen?
      const cur = (typeof getGlobalGpxPath === "function") ? getGlobalGpxPath() : null;
      if (cur) loadTrack(cur);
      // Nachträgliches Resize, falls das Layout erst nach onMapReady steht.
      setTimeout(() => { if (!isUnmounted && map) { try { map.resize(); } catch (_) {} } }, 350);
    });
  });

  if (typeof onGpxLoaded === "function") {
    onGpxLoaded(({ path }) => {
      if (isUnmounted) return;
      if (path) loadTrack(path); else clearTrack();
    });
  }

  // ── Laden / Anzeige ────────────────────────────────────────────────────────
  async function loadTrack(path) {
    let res;
    try { res = await api().gpxinspect_load(path); } catch (e) { res = { ok: false, error: String(e) }; }
    if (isUnmounted) return;
    if (!res || !res.ok) { toast((res && res.error) || "GPX-Fehler", "error", 5000); return; }
    _points = (res.points || []).map(p => ({ lat: p.lat, lon: p.lon, ele: p.ele, time: p.time }));
    _srcPath = path;
    _hasTime = !!res.has_time; _hasEle = !!res.has_ele;
    _selA = _selB = null; _dirty = false;
    _drawMode = false; _drawPts = [];
    clearSpikes();
    if (_undo) _undo.reset();
    renderAll();
    try { renderDraw(); } catch (_) {}
    fitTrack(res.bbox);
    updateUI();
  }

  function clearTrack() {
    _points = []; _srcPath = null; _selA = _selB = null; _dirty = false;
    try { if (map && map.getSource("gpxi-line")) map.getSource("gpxi-line").setData({ type: "Feature", geometry: { type: "LineString", coordinates: [] } }); } catch (_) {}
    try { if (map && map.getSource("gpxi-pts")) map.getSource("gpxi-pts").setData({ type: "FeatureCollection", features: [] }); } catch (_) {}
    updateUI();
  }

  function renderAll() {
    if (!map) return;
    try {
      const line = { type: "Feature", geometry: { type: "LineString", coordinates: _points.map(p => [p.lon, p.lat]) } };
      if (map.getSource("gpxi-line")) map.getSource("gpxi-line").setData(line);
    } catch (_) {}
    renderPoints();
  }

  function renderPoints() {
    if (!map || !map.getSource("gpxi-pts")) return;
    const feats = new Array(_points.length);
    for (let i = 0; i < _points.length; i++) {
      const p = _points[i];
      const sel = (i === _selA) ? "a" : (i === _selB) ? "b" : "";
      feats[i] = {
        type: "Feature",
        properties: { i: i, sel: sel, anchor: (sel !== ""), spike: _spikeSet.has(i) },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      };
    }
    try { map.getSource("gpxi-pts").setData({ type: "FeatureCollection", features: feats }); } catch (_) {}
  }

  function fitTrack(bbox) {
    if (!map || !_points.length) return;
    try {
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      for (const p of _points) {
        if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
        if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      }
      map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, duration: 600, maxZoom: 17 });
    } catch (_) {}
  }

  // ── Auswahl ─────────────────────────────────────────────────────────────────
  function onPointClick(e) {
    if (_drawMode) return;   // im Zeichnen-Modus keine Anker-Änderung
    const f = e.features && e.features[0];
    if (!f) return;
    const i = f.properties.i;
    if (_selA === null) { _selA = i; }
    else if (_selB === null) {
      if (i === _selA) return;
      _selB = i;
      if (_selB < _selA) { const tmp = _selA; _selA = _selB; _selB = tmp; }
    } else {
      _selA = i; _selB = null;   // dritter Klick = neue Auswahl starten
    }
    renderPoints();
    updateUI();
  }

  function clearSelection() { _selA = _selB = null; renderPoints(); updateUI(); }

  // ── Punkt verschieben (Drag, v0.9.243) ───────────────────────────────────────
  // Nur der ausgewählte grüne Anker A (Einzel-Auswahl) ist ziehbar. Zeit + Höhe
  // bleiben, nur die Position ändert sich → Geschwindigkeit bleibt korrekt.
  function onPointMouseDown(e) {
    if (_drawMode || _selB !== null) return;
    const f = e.features && e.features[0];
    if (!f || f.properties.i !== _selA) return;
    e.preventDefault();                       // Karte nicht mitziehen
    _dragging = true; _dragMoved = false;
    try { map.getCanvas().style.cursor = "grabbing"; } catch (_) {}
  }
  function onDragMove(e) {
    if (!_dragging || _selA === null) return;
    if (!_dragMoved) { _pushUndo(t("gpxinspect.move", "Punkt verschieben")); _dragMoved = true; }
    _points[_selA].lat = e.lngLat.lat;
    _points[_selA].lon = e.lngLat.lng;
    renderAll();                              // Linie + Punkte aktualisieren
  }
  function onDragEnd() {
    if (!_dragging) return;
    _dragging = false;
    try { map.getCanvas().style.cursor = ""; } catch (_) {}
    if (_dragMoved) { _dirty = true; clearSpikes(); renderAll(); updateUI(); }
  }

  // ── Edit-Operationen ─────────────────────────────────────────────────────────
  function healSegment() {
    if (_selA === null || _selB === null || _selB <= _selA + 1) return;
    _pushUndo(t("gpxinspect.heal", "Heilen"));
    const A = _points[_selA], B = _points[_selB];
    const span = _selB - _selA;
    for (let k = _selA + 1; k < _selB; k++) {
      const tt = (k - _selA) / span;
      _points[k].lat = A.lat + (B.lat - A.lat) * tt;
      _points[k].lon = A.lon + (B.lon - A.lon) * tt;
      if (A.ele != null && B.ele != null) _points[k].ele = A.ele + (B.ele - A.ele) * tt;
      // Zeit ABSICHTLICH unverändert → Geschwindigkeit korrigiert sich selbst.
    }
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.healed", "Abschnitt geglättet — Zeit behalten, Geschwindigkeit korrigiert."), "success", 2200);
  }

  function _haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const la1 = a.lat * rad, la2 = b.lat * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function fillGap() {
    if (_selA === null || _selB === null || _selB <= _selA) return;
    _pushUndo(t("gpxinspect.fill", "Lücke füllen"));
    const A = _points[_selA], B = _points[_selB];
    let spacing = parseFloat((document.getElementById("gpxi-spacing") || {}).value) || 20;
    spacing = Math.max(2, Math.min(500, spacing));
    const dist = _haversine(A, B);
    let n = Math.max(1, Math.min(2000, Math.round(dist / spacing) - 1));
    const tA = A.time ? Date.parse(A.time) : null;
    const tB = B.time ? Date.parse(B.time) : null;
    const inserted = [];
    for (let k = 1; k <= n; k++) {
      const tt = k / (n + 1);
      const np = {
        lat: A.lat + (B.lat - A.lat) * tt,
        lon: A.lon + (B.lon - A.lon) * tt,
        ele: (A.ele != null && B.ele != null) ? (A.ele + (B.ele - A.ele) * tt) : (A.ele != null ? A.ele : null),
        time: (tA != null && tB != null) ? new Date(tA + (tB - tA) * tt).toISOString() : null,
      };
      inserted.push(np);
    }
    // Alles strikt zwischen A und B durch die neuen Punkte ersetzen.
    _points.splice(_selA + 1, (_selB - _selA - 1), ...inserted);
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.filled", "Lücke gefüllt: ") + inserted.length + " " + t("gpxinspect.points", "Punkte"), "success", 2200);
  }

  // ── Zeit-/Punkt-Info (Nutzer-Wunsch v0.9.263): beim Klick auf einen Punkt
  //    Index, Zeitstempel (lokal) und Höhe zeigen. _ptInfo wird in updateUI in die
  //    Auswahl-Zeile geschrieben.
  function _fmtPtTime(iso) {
    if (!iso) return t("gpxinspect.no_time", "ohne Zeit");
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try { return d.toLocaleString(); } catch (_) { return iso; }
  }
  function _fmtDur(ms) {
    if (ms == null || !isFinite(ms)) return "";
    let s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return (h ? h + "h " : "") + (m || h ? m + "m " : "") + s + "s";
  }
  function _ptInfo(idx) {
    const p = _points[idx];
    if (!p) return "";
    let s = "#" + (idx + 1);
    if (p.time) s += " · 🕑 " + _fmtPtTime(p.time);
    if (p.ele != null) s += " · " + Math.round(p.ele) + " m";
    return s;
  }

  // ── Map Matching (Track auf Straße/Weg snappen) ──────────────────────────────
  let _mmBusy = false;
  function _applyMatchedRange(startIdx, endIdx, matched) {
    const A = _points[startIdx], B = _points[endIdx];
    const tA = A.time ? Date.parse(A.time) : null;
    const tB = B.time ? Date.parse(B.time) : null;
    const eA = (A.ele != null) ? A.ele : null, eB = (B.ele != null) ? B.ele : null;
    const pts = matched.map(c => ({ lon: c[0], lat: c[1] }));
    // Kumulative Länge der gematchten Linie → Zeit/Höhe linear über die Strecke verteilen.
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + _haversine(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1] || 1;
    const newPts = pts.map((p, i) => {
      const f = cum[i] / total;
      return {
        lat: p.lat, lon: p.lon,
        ele: (eA != null && eB != null) ? (eA + (eB - eA) * f) : eA,
        time: (tA != null && tB != null) ? new Date(tA + (tB - tA) * f).toISOString() : null,
      };
    });
    _points.splice(startIdx, (endIdx - startIdx + 1), ...newPts);
  }

  // v0.9.268 — Eine Linie [{lon,lat}] auf ~spacingM Punktabstand nachverdichten.
  function _densifyLine(line, spacingM) {
    if (line.length < 2) return line.slice();
    const sp = Math.max(2, spacingM || 20);
    const out = [{ lon: line[0].lon, lat: line[0].lat }];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const d = _haversine(a, b);
      const steps = Math.max(1, Math.round(d / sp));
      for (let k = 1; k <= steps; k++) {
        const tt = k / steps;
        out.push({ lon: a.lon + (b.lon - a.lon) * tt, lat: a.lat + (b.lat - a.lat) * tt });
      }
    }
    return out;
  }

  // v0.9.268 — Routen-Ergebnis (Strecke A→B) einsetzen MIT:
  //  (1) Nachverdichtung auf die Punktdichte des Original-Abschnitts → der Animator
  //      (der die Marker-Bewegung pro Punkt-Index verteilt) gibt dem längeren Stück
  //      proportional mehr Frames → Geschwindigkeit stimmt wieder.
  //  (2) Zeit über die DURCHSCHNITTSGESCHWINDIGKEIT des Original-Abschnitts (Marc-Idee):
  //      die längere Route bekommt entsprechend mehr Zeit, statt ins alte A→B-Fenster
  //      gequetscht zu werden (= zu schnell). Alle nachfolgenden Zeitstempel werden um
  //      die Differenz mitverschoben, damit der Track zeitlich konsistent bleibt.
  function _applyRoutedRange(startIdx, endIdx, rawCoords) {
    const A = _points[startIdx], B = _points[endIdx];
    // Original-Abschnitt vermessen (Distanz für die Durchschnittsgeschwindigkeit).
    let dOrig = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) dOrig += _haversine(_points[i - 1], _points[i]);
    // Nachverdicht-Abstand = TYPISCHER (Median-)Punktabstand des ganzen Tracks, NICHT der
    // (oft spiky/spärliche) Original-Abschnitt → die geheilte Strecke kriegt dieselbe Dichte
    // wie der Rest und läuft im Animator nicht zu schnell.
    const _gaps = [];
    for (let i = 1; i < _points.length; i++) { const g = _haversine(_points[i - 1], _points[i]); if (g > 0.01) _gaps.push(g); }
    _gaps.sort((a, b) => a - b);
    const _med = _gaps.length ? _gaps[Math.floor(_gaps.length / 2)] : 20;
    const spacing = Math.max(5, Math.min(50, _med || 20));
    let pts = rawCoords.map(c => ({ lon: c[0], lat: c[1] }));
    pts = _densifyLine(pts, spacing);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + _haversine(pts[i - 1], pts[i]));
    const dNew = cum[cum.length - 1] || 1;
    const tA = A.time ? Date.parse(A.time) : null;
    const tB = B.time ? Date.parse(B.time) : null;
    const eA = (A.ele != null) ? A.ele : null, eB = (B.ele != null) ? B.ele : null;
    let timeAt, delta = 0;
    if (tA != null && tB != null && tB > tA && dOrig > 0) {
      const v = dOrig / (tB - tA);          // m pro ms = Durchschnittsgeschwindigkeit des Abschnitts
      timeAt = (i) => tA + cum[i] / v;       // konstante Geschwindigkeit über die neue Länge
      delta = (tA + dNew / v) - tB;          // ≥ 0: längere Route braucht mehr Zeit
    } else if (tA != null && tB != null) {
      timeAt = (i) => tA + (tB - tA) * (cum[i] / dNew);   // Fallback: linear (kein dOrig)
    } else {
      timeAt = () => null;
    }
    const newPts = pts.map((p, i) => {
      const f = cum[i] / dNew;
      const tt = timeAt(i);
      return {
        lat: p.lat, lon: p.lon,
        ele: (eA != null && eB != null) ? (eA + (eB - eA) * f) : eA,
        time: (tt != null) ? new Date(tt).toISOString() : null,
      };
    });
    // Nachfolgende Punkte zeitlich mitverschieben (vor dem Splice, Original-Indizes).
    if (delta > 0.5) {
      for (let i = endIdx + 1; i < _points.length; i++) {
        if (_points[i].time) _points[i].time = new Date(Date.parse(_points[i].time) + delta).toISOString();
      }
    }
    _points.splice(startIdx, (endIdx - startIdx + 1), ...newPts);
  }
  async function _runMatch(startIdx, endIdx, label) {
    if (_mmBusy || _drawMode) return;
    if (endIdx - startIdx < 1) return;
    const profile = (document.getElementById("gpxi-mm-profile") || {}).value || "walking";
    const radius = parseInt((document.getElementById("gpxi-mm-radius") || {}).value, 10) || 25;
    const coords = _points.slice(startIdx, endIdx + 1).map(p => [p.lon, p.lat]);
    _mmBusy = true; updateUI();
    toast(t("gpxinspect.matching", "Matche auf das Wegenetz …"), "info", 2000);
    let res;
    try { res = await api().gpxinspect_map_match(coords, profile, radius); }
    catch (e) { res = { ok: false, error: String(e) }; }
    _mmBusy = false;
    if (!res || !res.ok) {
      const err = res && res.error;
      if (err === "no_token") toast(t("gpxinspect.match_no_token", "Kein Mapbox-Token konfiguriert (siehe Einstellungen)."), "error", 3500);
      else toast(t("gpxinspect.match_failed", "Matching fehlgeschlagen: ") + (err || ""), "error", 3500);
      updateUI(); return;
    }
    const matched = res.coords || [];
    // res.matched===false → die API konnte NICHTS auf einen Weg legen (Spur zu weit weg).
    // Dann NICHT anwenden (sonst stiller No-Op = „passiert nix") — klare Meldung geben.
    if (matched.length < 2 || res.matched === false) {
      toast(t("gpxinspect.match_nomatch", "Kein Weg/keine Straße in der Nähe gefunden — Track liegt zu weit weg."), "warn", 3500);
      updateUI(); return;
    }
    _pushUndo(label);
    _applyMatchedRange(startIdx, endIdx, matched);
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.matched", "Auf das Wegenetz gelegt: ") + matched.length + " " + t("gpxinspect.points", "Punkte"), "success", 2500);
  }
  // v0.9.267 — A→B per DIRECTIONS-Route (Straße folgen) statt Map Matching: kein
  // 50-m-Radius-Limit, A/B werden auf die nächste Straße gesnappt + dazwischen geroutet.
  // Robust gegen jede GPS-Drift. Ersetzt die mittleren Punkte durch die echte Wege-Route,
  // Zeit/Höhe linear über die neue Länge verteilt (wie Map Matching).
  async function routeSelection() {
    if (_selA === null || _selB === null || _selB <= _selA) return;
    if (_mmBusy || _drawMode) return;
    const profile = (document.getElementById("gpxi-mm-profile") || {}).value || "walking";
    const A = _points[_selA], B = _points[_selB];
    _mmBusy = true; updateUI();
    toast(t("gpxinspect.routing", "Suche Route zwischen A und B …"), "info", 2000);
    let res;
    try { res = await api().gpxinspect_route_ab([A.lon, A.lat], [B.lon, B.lat], profile); }
    catch (e) { res = { ok: false, error: String(e) }; }
    _mmBusy = false;
    if (!res || !res.ok) {
      const err = res && res.error;
      if (err === "no_token") toast(t("gpxinspect.match_no_token", "Kein Mapbox-Token konfiguriert (siehe Einstellungen)."), "error", 3500);
      else toast(t("gpxinspect.route_failed", "Route konnte nicht berechnet werden: ") + (err || ""), "error", 3500);
      updateUI(); return;
    }
    const coords = res.coords || [];
    if (coords.length < 2 || res.matched === false) {
      toast(t("gpxinspect.route_nomatch", "Keine Route gefunden — A oder B liegt zu weit von einer Straße entfernt."), "warn", 3500);
      updateUI(); return;
    }
    _pushUndo(t("gpxinspect.match_sel", "Strecke A→B"));
    _applyRoutedRange(_selA, _selB, coords);
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.routed", "Strecke A→B auf die Straße gelegt: ") + coords.length + " " + t("gpxinspect.points", "Punkte"), "success", 2500);
  }
  function matchWhole() {
    if (_points.length < 2) return;
    _runMatch(0, _points.length - 1, t("gpxinspect.match_all", "Ganzen Track matchen"));
  }

  // ── Pfad zeichnen & füllen (v0.9.237) ────────────────────────────────────────
  function _setCursor(c) { try { if (map) map.getCanvas().style.cursor = c || ""; } catch (_) {} }
  function startDraw() {
    if (_selA === null || _selB === null || _selB <= _selA) return;
    _drawMode = true; _drawPts = [];
    _setCursor("crosshair");                 // Fadenkreuz fürs Punkte-Setzen
    renderDraw(); updateUI();
    toast(t("gpxinspect.draw_started", "Klick auf die Karte, um den Pfad zu zeichnen."), "info", 2500);
  }
  function onMapClickDraw(e) {
    if (!_drawMode) return;
    _drawPts.push({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    _setCursor("crosshair");                 // nach Klick wieder absichern
    renderDraw(); updateUI();
  }
  function undoDrawPoint() { if (_drawPts.length) { _drawPts.pop(); renderDraw(); updateUI(); } }
  function cancelDraw() { _drawMode = false; _drawPts = []; _setCursor(""); renderDraw(); updateUI(); }
  function renderDraw() {
    if (!map) return;
    const A = (_selA != null) ? _points[_selA] : null;
    const B = (_selB != null) ? _points[_selB] : null;
    const path = (_drawMode && A && B) ? [A, ..._drawPts, B] : [];
    try { if (map.getSource("gpxi-draw")) map.getSource("gpxi-draw").setData({ type: "Feature", geometry: { type: "LineString", coordinates: path.map(p => [p.lon, p.lat]) } }); } catch (_) {}
    try {
      const feats = _drawMode ? _drawPts.map((p, i) => ({ type: "Feature", properties: { i }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) : [];
      if (map.getSource("gpxi-draw-pts")) map.getSource("gpxi-draw-pts").setData({ type: "FeatureCollection", features: feats });
    } catch (_) {}
  }
  function applyDrawnPath() {
    if (!_drawMode || _selA === null || _selB === null || _selB <= _selA) return;
    const A = _points[_selA], B = _points[_selB];
    const path = [A, ..._drawPts, B];
    // Kumulative Distanzen entlang des gezeichneten Pfads.
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + _haversine(path[i - 1], path[i]));
    const total = cum[cum.length - 1];
    if (total <= 0) { cancelDraw(); return; }
    let spacing = parseFloat((document.getElementById("gpxi-spacing") || {}).value) || 20;
    spacing = Math.max(2, Math.min(500, spacing));
    const n = Math.max(1, Math.min(5000, Math.round(total / spacing) - 1));
    _pushUndo(t("gpxinspect.drawfill", "Pfad füllen"));
    const tA = A.time ? Date.parse(A.time) : null, tB = B.time ? Date.parse(B.time) : null;
    const inserted = [];
    let seg = 0;
    for (let k = 1; k <= n; k++) {
      const d = total * k / (n + 1);
      while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
      const segLen = cum[seg + 1] - cum[seg];
      const tt = segLen <= 0 ? 0 : (d - cum[seg]) / segLen;
      const a = path[seg], b = path[seg + 1];
      const frac = d / total;   // Höhe + Zeit linear A→B über die Pfad-Distanz
      inserted.push({
        lat: a.lat + (b.lat - a.lat) * tt,
        lon: a.lon + (b.lon - a.lon) * tt,
        ele: (A.ele != null && B.ele != null) ? (A.ele + (B.ele - A.ele) * frac) : (A.ele != null ? A.ele : null),
        time: (tA != null && tB != null) ? new Date(tA + (tB - tA) * frac).toISOString() : null,
      });
    }
    _points.splice(_selA + 1, (_selB - _selA - 1), ...inserted);
    _dirty = true;
    _drawMode = false; _drawPts = [];
    clearSpikes();
    clearSelection();           // ruft renderPoints + updateUI
    renderDraw();               // Zeichen-Layer leeren
    renderAll();
    toast(t("gpxinspect.drawfilled", "Pfad aufgefüllt: ") + inserted.length + " " + t("gpxinspect.points", "Punkte"), "success", 2400);
  }

  // Einzelnen ausgewählten Punkt (Anker A, ohne B) löschen. (v0.9.241)
  function deletePoint() {
    if (_selA === null || _selB !== null) return;
    if (_points.length <= 2) { toast(t("gpxinspect.too_few", "Zu wenige Punkte zum Löschen."), "warning", 2200); return; }
    _pushUndo(t("gpxinspect.delete_one", "Punkt löschen"));
    _points.splice(_selA, 1);
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.deleted", "Punkte gelöscht: ") + 1, "success", 1600);
  }

  function deleteBetween() {
    if (_selA === null || _selB === null || _selB <= _selA + 1) return;
    _pushUndo(t("gpxinspect.delete", "Punkte löschen"));
    const cnt = _selB - _selA - 1;
    _points.splice(_selA + 1, cnt);
    _dirty = true; clearSpikes(); clearSelection();
    renderAll(); updateUI();
    toast(t("gpxinspect.deleted", "Punkte gelöscht: ") + cnt, "success", 1800);
  }

  // ── Auto-Despike (v0.9.239) ──────────────────────────────────────────────────
  // Findet GPS-Ausreißer: Punkte, die weit wegspringen UND wieder zurückkommen
  // (Umweg über die Sehne A→C). Geometrisch robust (kein Zeitstempel nötig);
  // wenn Zeit da ist, zusätzlich Geschwindigkeits-Gate gegen Falsch-Positive bei
  // echten scharfen Kurven. Echte Lücken (langer gerader Sprung ohne Rückkehr)
  // werden NICHT markiert — der Umweg ist dort ~0.
  function detectSpikes() {
    const P = _points, n = P.length;
    if (n < 3) return [];
    const seg = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) seg[i] = _haversine(P[i], P[i + 1]);
    const sorted = [...seg].sort((a, b) => a - b);
    const medSeg = sorted[Math.floor(sorted.length / 2)] || 0;
    const haveTime = _hasTime && P.every(p => p.time);
    // Empfindlichkeit 1..10 (Slider) → Schwellen. 1 = nur krasse Sprünge,
    // 10 = auch kleine Zacken. lerp über den Slider-Bereich.
    const sens = Math.max(1, Math.min(10, parseFloat((document.getElementById("gpxi-sens") || {}).value) || 5));
    const lerp = (a, b) => a + (b - a) * (sens - 1) / 9;
    const SPIKE_FACTOR = lerp(12, 2);              // Vielfaches des mittleren Punktabstands
    const FLOOR = lerp(120, 15);                    // Mindest-Sprungweite in m
    const ABS_JUMP = Math.max(FLOOR, medSeg * SPIKE_FACTOR);
    const SPEED_CAP = lerp(120, 25);               // m/s; 120≈432 km/h … 25≈90 km/h
    const flags = new Array(n).fill(false);
    for (let i = 1; i < n - 1; i++) {
      const inD = seg[i - 1], outD = seg[i];
      const chord = _haversine(P[i - 1], P[i + 1]);
      const detour = inD + outD - chord;           // wie weit der Punkt aus der Sehne ragt
      const bigJump = (inD > ABS_JUMP || outD > ABS_JUMP);
      const returns = detour > ABS_JUMP * 0.8;     // springt raus UND zurück
      let speedBad = true;
      if (haveTime) {
        const dtIn = (Date.parse(P[i].time) - Date.parse(P[i - 1].time)) / 1000;
        const dtOut = (Date.parse(P[i + 1].time) - Date.parse(P[i].time)) / 1000;
        const vIn = dtIn > 0 ? inD / dtIn : Infinity;
        const vOut = dtOut > 0 ? outD / dtOut : Infinity;
        speedBad = (vIn > SPEED_CAP || vOut > SPEED_CAP);
      }
      if (bigJump && returns && speedBad) flags[i] = true;
    }
    // Aufeinanderfolgende markierte Punkte zu einer Ausreißer-Gruppe zusammenfassen.
    const groups = [];
    let i = 0;
    while (i < n) {
      if (flags[i]) {
        let j = i; while (j + 1 < n && flags[j + 1]) j++;
        const a = i - 1, b = j + 1;
        if (a >= 0 && b < n) groups.push({ a, b, from: i, to: j });
        i = j + 1;
      } else i++;
    }
    return groups;
  }

  function clearSpikes() {
    _spikes = []; _spikeSet = new Set(); _spikeIdx = -1; _despikeRan = false;
  }

  function runDespike(opts) {
    if (_drawMode || !_points.length) return;
    const silent = !!(opts && opts.silent);   // vom Slider: nur Markierung neu, kein Toast/Zoom
    _despikeRan = true;
    const groups = detectSpikes();
    _spikes = groups; _spikeIdx = -1;
    _spikeSet = new Set();
    for (const g of groups) for (let k = g.from; k <= g.to; k++) _spikeSet.add(k);
    _selA = _selB = null;
    renderPoints(); updateUI();
    if (silent) return;
    if (!groups.length) { toast(t("gpxinspect.spike_none", "Keine Ausreißer gefunden 👍"), "info", 2800); return; }
    toast(t("gpxinspect.spike_marked", "Ausreißer markiert: ") + groups.length, "success", 2600);
    gotoSpike(0);
  }

  function gotoSpike(k) {
    if (!_spikes.length) return;
    _spikeIdx = Math.max(0, Math.min(_spikes.length - 1, k));
    const g = _spikes[_spikeIdx];
    _selA = g.a; _selB = g.b;
    renderPoints();
    // Auf die Ausreißer-Region zoomen (Anker + dazwischen).
    try {
      let mnLon = Infinity, mnLat = Infinity, mxLon = -Infinity, mxLat = -Infinity;
      for (let k2 = g.a; k2 <= g.b; k2++) {
        const p = _points[k2];
        if (p.lon < mnLon) mnLon = p.lon; if (p.lon > mxLon) mxLon = p.lon;
        if (p.lat < mnLat) mnLat = p.lat; if (p.lat > mxLat) mxLat = p.lat;
      }
      map.fitBounds([[mnLon, mnLat], [mxLon, mxLat]], { padding: 120, duration: 500, maxZoom: 18 });
    } catch (_) {}
    updateUI();
  }

  function healAllSpikes() {
    if (!_spikes.length) return;
    _pushUndo(t("gpxinspect.despike", "Ausreißer heilen"));
    // Heilen verschiebt nur (kein Splice) → Indizes bleiben gültig, Reihenfolge egal.
    for (const g of _spikes) {
      const A = _points[g.a], B = _points[g.b], span = g.b - g.a;
      for (let k = g.a + 1; k < g.b; k++) {
        const tt = (k - g.a) / span;
        _points[k].lat = A.lat + (B.lat - A.lat) * tt;
        _points[k].lon = A.lon + (B.lon - A.lon) * tt;
        if (A.ele != null && B.ele != null) _points[k].ele = A.ele + (B.ele - A.ele) * tt;
        // Zeit bleibt → Geschwindigkeit korrigiert sich selbst.
      }
    }
    const cnt = _spikes.length;
    _dirty = true; clearSpikes(); _selA = _selB = null;
    renderAll(); updateUI();
    toast(t("gpxinspect.spike_healed", "Ausreißer geheilt: ") + cnt, "success", 2600);
  }

  async function saveTrack() {
    if (!_points.length) return;
    const payload = _points.map(p => ({ lat: p.lat, lon: p.lon, ele: p.ele, time: p.time }));
    let res;
    try { res = await api().gpxinspect_save(payload, _srcPath); } catch (e) { res = { ok: false, error: String(e) }; }
    if (isUnmounted) return;
    if (!res || !res.ok) { toast((res && res.error) || "Speichern fehlgeschlagen", "error", 6000); return; }
    _dirty = false; updateUI();
    const note = document.getElementById("gpxi-note");
    if (note) note.textContent = t("gpxinspect.saved", "Gespeichert: ") + res.out_path;
    toast(t("gpxinspect.saved", "Gespeichert: ") + res.out_path, "success", 6000);
    // Geheiltes GPX gleich global laden → alle Module nutzen die saubere Version,
    // und der Inspektor zeigt ab jetzt den geheilten Track.
    if (typeof loadGlobalGpx === "function") { try { loadGlobalGpx(res.out_path); } catch (_) {} }
  }

  // ── UI-State ─────────────────────────────────────────────────────────────────
  function _fmtKm(m) { return (m / 1000 < 100) ? (m / 1000).toFixed(1) + " km" : Math.round(m / 1000) + " km"; }
  function updateUI() {
    const has = _points.length > 0;
    const empty = document.getElementById("gpxi-empty");
    const panel = document.getElementById("gpxi-panel");
    if (empty) empty.hidden = has;
    if (panel) panel.hidden = !has;
    if (!has) return;
    // Stats
    let dist = 0;
    for (let i = 1; i < _points.length; i++) dist += _haversine(_points[i - 1], _points[i]);
    const stat = document.getElementById("gpxi-stat");
    if (stat) stat.textContent = _points.length + " " + t("gpxinspect.points", "Punkte") + " · " + _fmtKm(dist)
      + (_hasTime ? "" : " · " + t("gpxinspect.no_time", "ohne Zeit"))
      + (_dirty ? " · " + t("gpxinspect.unsaved", "ungespeichert") : "");
    // Auswahl-Text
    const selEl = document.getElementById("gpxi-sel");
    const haveA = _selA !== null, haveB = _selB !== null;
    if (selEl) {
      if (!haveA) selEl.textContent = t("gpxinspect.sel_none", "Keine Auswahl");
      else if (!haveB) {
        // v0.9.263 — Zeit/Höhe des angeklickten Punktes zeigen (Nutzer-Wunsch).
        selEl.textContent = t("gpxinspect.sel_a_short", "Anker A: ") + _ptInfo(_selA)
          + " — " + t("gpxinspect.sel_a_next", "jetzt B klicken");
      } else {
        const between = _selB - _selA - 1;
        const segDist = _haversine(_points[_selA], _points[_selB]);
        const tA = _points[_selA].time ? Date.parse(_points[_selA].time) : null;
        const tB = _points[_selB].time ? Date.parse(_points[_selB].time) : null;
        const dur = (tA != null && tB != null) ? (" · ⏱ " + _fmtDur(tB - tA)) : "";
        selEl.textContent = t("gpxinspect.sel_ab", "A→B: ") + between + " " + t("gpxinspect.between", "Punkte dazwischen") + " · " + _fmtKm(segDist) + dur;
      }
    }
    const both = haveA && haveB;
    const hasBetween = both && (_selB > _selA + 1);
    setDisabled("gpxi-heal", !hasBetween || _drawMode);
    setDisabled("gpxi-fill", !both || _drawMode);
    setDisabled("gpxi-drawfill", !both || _drawMode);
    setDisabled("gpxi-delete-one", !(haveA && !haveB) || _drawMode);
    setDisabled("gpxi-delete", !hasBetween || _drawMode);
    // Map Matching: Bereich sobald A+B gesetzt sind (≥2 Punkte reichen zum Snappen —
    // anders als „Lücke füllen" braucht es KEINE Punkte dazwischen); ganzer Track sobald Punkte da.
    setDisabled("gpxi-match-sel", !both || _drawMode || _mmBusy);
    setDisabled("gpxi-match-all", _drawMode || _mmBusy || _points.length < 2);
    setDisabled("gpxi-clearsel", !haveA || _drawMode);
    setDisabled("gpxi-save", !_dirty || _drawMode);
    setDisabled("gpxi-reset", !_dirty || _drawMode);
    setDisabled("gpxi-undo", _drawMode || !(_undo && _undo.canUndo()));
    setDisabled("gpxi-redo", _drawMode || !(_undo && _undo.canRedo()));
    // Auto-Despike: Button frei wenn Punkte da & nicht im Zeichnen-Modus.
    setDisabled("gpxi-despike", _drawMode);
    const spikeBox = document.getElementById("gpxi-spikebox");
    const nSpk = _spikes.length;
    if (spikeBox) spikeBox.hidden = (nSpk === 0) || _drawMode;
    if (nSpk > 0) {
      const sh = document.getElementById("gpxi-spikehint");
      if (sh) sh.textContent = t("gpxinspect.spike_nav", "Ausreißer ") + (_spikeIdx + 1) + "/" + nSpk;
      setDisabled("gpxi-spike-prev", _spikeIdx <= 0);
      setDisabled("gpxi-spike-next", _spikeIdx >= nSpk - 1);
    }
    // Zeichnen-Modus: Box ein, Stützpunkt-Zähler, Übernehmen/Undo nach Bedarf.
    const drawBox = document.getElementById("gpxi-drawbox");
    if (drawBox) drawBox.hidden = !_drawMode;
    if (_drawMode) {
      const dh = document.getElementById("gpxi-drawhint");
      if (dh) dh.textContent = t("gpxinspect.draw_count", "Stützpunkte gesetzt: ") + _drawPts.length
        + " — " + t("gpxinspect.draw_more", "weiter klicken oder übernehmen.");
      setDisabled("gpxi-draw-apply", _drawPts.length < 1);
      setDisabled("gpxi-draw-undo", _drawPts.length < 1);
    }
  }
  function setDisabled(id, dis) { const el = document.getElementById(id); if (el) el.disabled = !!dis; }

  // ── Listener ─────────────────────────────────────────────────────────────────
  const _on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
  _on("gpxi-heal", healSegment);
  _on("gpxi-fill", fillGap);
  _on("gpxi-drawfill", startDraw);
  _on("gpxi-draw-apply", applyDrawnPath);
  _on("gpxi-draw-undo", undoDrawPoint);
  _on("gpxi-draw-cancel", cancelDraw);
  _on("gpxi-delete-one", deletePoint);
  _on("gpxi-delete", deleteBetween);
  _on("gpxi-clearsel", clearSelection);
  _on("gpxi-match-sel", routeSelection);
  _on("gpxi-match-all", matchWhole);
  { const rad = document.getElementById("gpxi-mm-radius"), rlbl = document.getElementById("gpxi-mm-radius-val");
    if (rad && rlbl) rad.addEventListener("input", () => { rlbl.textContent = rad.value + " m"; }); }

  // Entf/Backspace: einzelnen Punkt (nur A) oder Bereich (A+B) löschen.
  // Nicht feuern wenn man in einem Eingabefeld tippt oder im Zeichnen-Modus ist.
  function onKeyDown(e) {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (_drawMode) return;
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
    const panel = document.getElementById("gpxi-panel");
    if (!panel || panel.hidden || !panel.offsetParent) return;   // Modul nicht sichtbar
    if (_selA !== null && _selB === null) { e.preventDefault(); deletePoint(); }
    else if (_selA !== null && _selB !== null && _selB > _selA + 1) { e.preventDefault(); deleteBetween(); }
  }
  document.addEventListener("keydown", onKeyDown);
  _on("gpxi-undo", () => { if (_undo) _undo.undo(); });
  _on("gpxi-redo", () => { if (_undo) _undo.redo(); });
  _on("gpxi-despike", () => runDespike());
  // Empfindlichkeits-Slider: Label live, und wenn schon gesucht wurde, Markierung
  // sofort neu rechnen (ohne Toast/Zoom) während man zieht.
  (function () {
    const sl = document.getElementById("gpxi-sens");
    const lbl = document.getElementById("gpxi-sens-val");
    if (!sl) return;
    sl.addEventListener("input", () => {
      if (lbl) lbl.textContent = sl.value;
      if (_despikeRan && !_drawMode) runDespike({ silent: true });
    });
  })();
  _on("gpxi-spike-prev", () => gotoSpike(_spikeIdx - 1));
  _on("gpxi-spike-next", () => gotoSpike(_spikeIdx + 1));
  _on("gpxi-spike-healall", healAllSpikes);
  _on("gpxi-spike-clear", () => { clearSpikes(); _selA = _selB = null; renderPoints(); updateUI(); });
  _on("gpxi-save", saveTrack);
  _on("gpxi-reset", () => { if (_srcPath) loadTrack(_srcPath); });

  updateUI();

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  return function cleanup() {
    isUnmounted = true;
    try { document.removeEventListener("keydown", onKeyDown); } catch (_) {}
    try { if (map) { map.remove(); } } catch (_) {}
    map = null;
  };
}
