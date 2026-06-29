"""
core/autotag.py — Bilderkennung für automatische Verschlagwortung (v0.9.349).

**Nur macOS.** Nutzt das eingebaute **Apple-Vision-Framework** (on-device, kein
Download, kein Netz, kein Konto) über PyObjC, um zu jedem Foto Szenen-/Objekt-
Labels zu erkennen (z.B. „outdoor, forest, deer"). Die Labels werden — soweit
bekannt — ins Deutsche übersetzt; unbekannte bleiben (bereinigt) englisch.

Cross-Platform-Politik (Marc-Regel): macOS bekommt das Feature, Windows/Linux
nicht — `is_available()` liefert dort `False`, das UI blendet den Button aus.
Apple Vision ist OS-eigen → nichts zu bundeln; auf Nicht-Mac gibt's das schlicht
nicht.

Bewusst KEIN großes LLM: für reine Stichwörter ist der eingebaute Klassifikator
schneller (~30–160 ms/Foto) und völlig ausreichend. Die Treffer sind Vorschläge
— der Nutzer prüft sie (landen als ausstehende EXIF-Edits) und schreibt dann.
"""

from __future__ import annotations

import logging
import sys

log = logging.getLogger("reisezoom.autotag")

# ── Vision lazy/guarded importieren ────────────────────────────────────────
_VISION = None        # Modul-Handle (None solange ungeprüft/nicht verfügbar)
_AVAILABLE: bool | None = None


def _try_import() -> bool:
    """Lädt Vision + Foundation einmalig. True wenn auf diesem System nutzbar."""
    global _VISION, _AVAILABLE
    if _AVAILABLE is not None:
        return _AVAILABLE
    if sys.platform != "darwin":
        _AVAILABLE = False
        return False
    try:
        import Vision  # type: ignore
        import Foundation  # noqa: F401  (für NSURL)
        _VISION = Vision
        _AVAILABLE = True
        log.info("autotag: Apple Vision verfügbar")
    except Exception as e:  # pragma: no cover (nur auf nicht-mac / kaputtem pyobjc)
        _AVAILABLE = False
        log.info("autotag: Apple Vision NICHT verfügbar (%s)", e)
    return _AVAILABLE


def is_available() -> bool:
    """True, wenn die Bilderkennung auf diesem System läuft (= macOS + Vision)."""
    return _try_import()


# ── Label-Aufbereitung ─────────────────────────────────────────────────────
# Übersetzung der häufigsten Apple-Vision-Labels (Outdoor/Natur/Reise-Kontext).
# Unbekannte Labels bleiben bereinigt englisch (Nutzer kann editieren).
_DE = {
    "outdoor": "Outdoor", "indoor": "Indoor", "nature": "Natur",
    "land": "Landschaft", "landscape": "Landschaft", "sky": "Himmel",
    "cloud": "Wolken", "cloudy": "Wolken", "clouds": "Wolken",
    "sunset": "Sonnenuntergang", "sunrise": "Sonnenaufgang", "sun": "Sonne",
    "fog": "Nebel", "mist": "Nebel", "rain": "Regen", "snow": "Schnee",
    "grass": "Wiese", "meadow": "Wiese", "field": "Feld",
    "plant": "Pflanze", "plants": "Pflanzen", "tree": "Baum", "trees": "Bäume",
    "forest": "Wald", "woods": "Wald", "wood_natural": "Holz", "moss": "Moos",
    "flower": "Blume", "flowers": "Blumen", "leaf": "Blatt", "foliage": "Laub",
    "mountain": "Berg", "mountains": "Berge", "hill": "Hügel", "hills": "Hügel",
    "rock": "Fels", "rocks": "Felsen", "stone": "Stein", "cliff": "Klippe",
    "sand": "Sand", "beach": "Strand", "desert": "Wüste", "valley": "Tal",
    "water": "Wasser", "lake": "See", "river": "Fluss", "stream": "Bach",
    "sea": "Meer", "ocean": "Meer", "waterfall": "Wasserfall", "pond": "Teich",
    "animal": "Tier", "animals": "Tiere", "dog": "Hund", "cat": "Katze",
    "bird": "Vogel", "birds": "Vögel", "horse": "Pferd", "cow": "Kuh",
    "sheep": "Schaf", "deer": "Reh", "fish": "Fisch", "insect": "Insekt",
    "people": "Menschen", "person": "Person", "adult": "Erwachsener",
    "child": "Kind", "children": "Kinder", "man": "Mann", "woman": "Frau",
    "portrait": "Porträt", "face": "Gesicht", "selfie": "Selfie",
    "vehicle": "Fahrzeug", "car": "Auto", "bicycle": "Fahrrad", "bike": "Fahrrad",
    "motorcycle": "Motorrad", "boat": "Boot", "ship": "Schiff", "train": "Zug",
    "streetcar": "Straßenbahn", "bus": "Bus", "truck": "Lkw",
    "building": "Gebäude", "house": "Haus", "church": "Kirche", "castle": "Burg",
    "tower": "Turm", "bridge": "Brücke", "road": "Straße", "street": "Straße",
    "path": "Weg", "trail": "Pfad", "fence": "Zaun", "wall": "Mauer",
    "city": "Stadt", "town": "Ort", "village": "Dorf", "park": "Park",
    "garden": "Garten", "ruins": "Ruine", "monument": "Denkmal",
    "food": "Essen", "drink": "Getränk", "fruit": "Obst", "vegetable": "Gemüse",
    "camera": "Kamera", "boots": "Stiefel", "backpack": "Rucksack",
    "tent": "Zelt", "campfire": "Lagerfeuer", "camping": "Camping",
    "hiking": "Wandern", "night": "Nacht", "day": "Tag",
}

# Zu generische/technische Labels, die als Stichwort wenig bringen → raus.
_SKIP = {
    "structure", "material", "machine", "equipment", "optical_equipment",
    "manmade", "manmade_object", "object", "surface", "texture", "pattern",
    "device", "instrument", "tool", "art", "abstract", "background",
    "document", "screenshot", "text", "paper",
}


def _clean(label: str) -> str:
    return str(label or "").replace("_", " ").strip()


def suggest_keywords(path: str, max_tags: int = 8, min_conf: float = 0.25,
                     lang: str = "de") -> list[str]:
    """Liefert eine Liste vorgeschlagener Stichwörter für ein Foto (geordnet nach
    Konfidenz). Leere Liste, wenn Vision nicht verfügbar ist oder nichts greift."""
    if not _try_import():
        return []
    import Foundation
    Vision = _VISION
    try:
        url = Foundation.NSURL.fileURLWithPath_(path)
        handler = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, None)
        req = Vision.VNClassifyImageRequest.alloc().init()
        ok, _err = handler.performRequests_error_([req], None)
        if not ok:
            return []
        results = req.results() or []
    except Exception:
        log.exception("autotag: Klassifikation fehlgeschlagen für %s", path)
        return []

    seen: set[str] = set()
    out: list[str] = []
    for obs in results:
        try:
            conf = float(obs.confidence())
            ident = str(obs.identifier())
        except Exception:
            continue
        if conf < min_conf:
            continue
        key = ident.lower()
        if key in _SKIP:
            continue
        word = _DE.get(key, _clean(ident)) if lang == "de" else _clean(ident)
        wl = word.lower()
        if wl in seen:
            continue
        seen.add(wl)
        out.append(word)
        if len(out) >= max_tags:
            break
    return out
