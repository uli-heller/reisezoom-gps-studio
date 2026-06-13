"""
GPX-Inspektor / Track-Editing (v0.9.233 — Marc-Idee, Beta-Tester-Bug-Report (c)).

Lädt den VOLLEN Roh-Track (jeder GPS-Punkt, NICHT das 800-Downsample der
Render-Pipeline) und schreibt einen editierten Track zurück. Die eigentliche
Heil-/Einfüge-Logik läuft im Frontend (interaktiv auf der Karte); hier nur
Laden (alle Punkte inkl. ele + time) und Speichern als neues GPX.

Konsistenz-Prinzip (Marc): beim „Heilen" werden nur Position + Höhe interpoliert,
die ZEITSTEMPEL bleiben — dadurch korrigiert sich die Geschwindigkeit von selbst
(gleiche Zeit, saubere kurze Strecke statt Reflektions-Spike). Beim Einfügen
neuer Punkte (Lücke füllen) werden lat/lon/ele UND time interpoliert.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Optional

import gpxpy
import gpxpy.gpx

from . import gpx as cgpx


def load_points(path: str) -> dict:
    """Alle Track-Punkte mit Index, lat, lon, ele, time (ISO-UTC) laden.

    Returns {ok, points:[{i,lat,lon,ele,time}], count, has_time, has_ele, bbox}.
    """
    pts, stats = cgpx.parse_gpx(path)
    out = []
    has_time = False
    has_ele = False
    for i, p in enumerate(pts):
        if p.time:
            has_time = True
        if p.ele is not None:
            has_ele = True
        out.append({
            "i": i,
            "lat": float(p.lat),
            "lon": float(p.lon),
            "ele": (None if p.ele is None else float(p.ele)),
            "time": p.time,  # ISO-String oder None
        })
    bbox = getattr(stats, "bbox", None) or {}
    return {
        "ok": True,
        "points": out,
        "count": len(out),
        "has_time": has_time,
        "has_ele": has_ele,
        "bbox": bbox,
    }


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # ISO-8601, evtl. mit 'Z'
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t
    except Exception:
        return None


def save_points(points: List[dict], out_path: str, *, name: str = "Geheilt") -> dict:
    """Editierte Punkte als neues GPX schreiben (ein Track, ein Segment).

    points = [{lat, lon, ele?, time?}] in Reihenfolge. Returns {ok, out_path, count}.
    """
    if not points or len(points) < 2:
        return {"ok": False, "error": "Zu wenige Punkte zum Speichern"}
    gpx = gpxpy.gpx.GPX()
    trk = gpxpy.gpx.GPXTrack(name=name)
    gpx.tracks.append(trk)
    seg = gpxpy.gpx.GPXTrackSegment()
    trk.segments.append(seg)
    n = 0
    for p in points:
        try:
            lat = float(p["lat"]); lon = float(p["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        ele = p.get("ele")
        ele_f = None
        if ele is not None:
            try:
                ele_f = float(ele)
            except (TypeError, ValueError):
                ele_f = None
        tp = gpxpy.gpx.GPXTrackPoint(
            latitude=lat, longitude=lon, elevation=ele_f, time=_parse_iso(p.get("time"))
        )
        seg.points.append(tp)
        n += 1
    if n < 2:
        return {"ok": False, "error": "Zu wenige gültige Punkte"}
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(gpx.to_xml())
    return {"ok": True, "out_path": out_path, "count": n}


def healed_output_path(src_path: str) -> str:
    """`/dir/2. Jan 2020.gpx` → `/dir/2. Jan 2020_geheilt.gpx`."""
    d = os.path.dirname(src_path)
    base = os.path.basename(src_path)
    stem, ext = os.path.splitext(base)
    if not ext:
        ext = ".gpx"
    return os.path.join(d, f"{stem}_geheilt{ext}")
