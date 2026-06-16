"""
Track-Export als String — GPX und CSV.

Single source of truth: wird von der Desktop-App (Bridge `export_current_csv`)
UND vom Web-Endpoint (`gps-studio-web/api/export.py`) genutzt. Punkte sind
`[{lat, lon, ele?, time?}]` (oder Objekte mit gleichnamigen Attributen); `time`
ist ISO-8601 (UTC) oder None.
"""
from __future__ import annotations

import csv
import io
import xml.sax.saxutils as _sx
from datetime import datetime, timezone
from typing import List, Optional


def _get(p, key):
    if isinstance(p, dict):
        return p.get(key)
    return getattr(p, key, None)


def _parse_iso(s):
    if not s:
        return None
    try:
        t = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def to_gpx_string(points, name: Optional[str] = None) -> str:
    """Punkte als valides GPX-1.1 (ein Track, ein Segment) zurückgeben."""
    nm = _sx.escape(name) if name else "Track"
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="Reisezoom GPS Studio" '
        'xmlns="http://www.topografix.com/GPX/1/1">',
        f"<trk><name>{nm}</name><trkseg>",
    ]
    for p in points:
        lat = _get(p, "lat"); lon = _get(p, "lon")
        if lat is None or lon is None:
            continue
        ele = _get(p, "ele"); tm = _get(p, "time")
        seg = [f'<trkpt lat="{float(lat):.7f}" lon="{float(lon):.7f}">']
        if ele is not None:
            try:
                seg.append(f"<ele>{float(ele):.2f}</ele>")
            except (TypeError, ValueError):
                pass
        dt = _parse_iso(tm)
        if dt is not None:
            seg.append("<time>" + dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "</time>")
        seg.append("</trkpt>")
        out.append("".join(seg))
    out.append("</trkseg></trk></gpx>")
    return "\n".join(out) + "\n"


def to_csv_string(points) -> str:
    """Punkte als CSV: index,lat,lon,ele,time (ISO-UTC oder leer)."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["index", "lat", "lon", "ele", "time"])
    i = 0
    for p in points:
        lat = _get(p, "lat"); lon = _get(p, "lon")
        if lat is None or lon is None:
            continue
        ele = _get(p, "ele"); tm = _get(p, "time")
        dt = _parse_iso(tm)
        w.writerow([
            i,
            f"{float(lat):.7f}",
            f"{float(lon):.7f}",
            ("" if ele is None else f"{float(ele):.2f}"),
            ("" if dt is None else dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
        ])
        i += 1
    return buf.getvalue()


def to_string(points, fmt: str = "gpx", name: Optional[str] = None) -> str:
    fmt = (fmt or "gpx").lower()
    if fmt == "csv":
        return to_csv_string(points)
    return to_gpx_string(points, name)
