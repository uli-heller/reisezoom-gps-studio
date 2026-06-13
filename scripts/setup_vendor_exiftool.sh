#!/usr/bin/env bash
# Reisezoom GPS Studio — exiftool-Binary für macOS + Windows ins
# vendor/-Verzeichnis laden, damit PyInstaller es ins App-Bundle einbacken kann.
#
# Wann benutzen:
#   - Erster Build auf einem frischen Checkout
#   - Wenn vendor/exiftool/ fehlt (durch git clean o.ä.)
#   - In CI (GitHub Actions) vor `pyinstaller`
#
# Marc-Regel 2026-05-25: Linux-User installieren ExifTool selbst via
# Paketmanager (siehe USER_GUIDE.md). Daher hier nur macOS + Windows.

set -e

# Aktuelle stabile Version dynamisch von exiftool.org holen — die Seite hostet
# nur die jeweils AKTUELLE Version unter dem versionierten Pfad (alte → 404),
# darum nicht hardcoden (sonst bricht der CI-Build sobald eine neue Version
# rauskommt). Fallback auf eine bekannte Version, falls ver.txt nicht erreichbar.
EXIFTOOL_VERSION="$(curl -fsSL https://exiftool.org/ver.txt 2>/dev/null | tr -d '[:space:]')"
[ -z "$EXIFTOOL_VERSION" ] && EXIFTOOL_VERSION="13.59"
echo "ℹ ExifTool-Version: ${EXIFTOOL_VERSION}"

# Projekt-Root finden (Script liegt in scripts/, vendor/ ist daneben)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="${DIR}/vendor/exiftool"

mkdir -p "${VENDOR}"
cd "${VENDOR}"

# ── macOS ────────────────────────────────────────────────────────────
# Image-ExifTool-X.YZ.tar.gz = Perl-Source-Distribution mit `exiftool`-Script
# + lib/-Modulen. Läuft auf macOS via System-Perl (/usr/bin/perl).
if [ ! -f "macos/exiftool" ]; then
  echo "📥 Lade ExifTool ${EXIFTOOL_VERSION} (macOS) …"
  TMP_TAR="macos-${EXIFTOOL_VERSION}.tar.gz"
  curl -fsSL "https://exiftool.org/Image-ExifTool-${EXIFTOOL_VERSION}.tar.gz" -o "${TMP_TAR}"
  rm -rf macos
  mkdir -p macos
  tar -xzf "${TMP_TAR}" -C macos --strip-components=1
  # Bloat raus — wir brauchen nur exiftool + lib/
  cd macos
  rm -rf t html Changes MANIFEST META.json META.yml Makefile.PL \
         README windows_exiftool config_files arg_files \
         perl-Image-ExifTool.spec fmt_files build_geolocation 2>/dev/null || true
  cd ..
  rm -f "${TMP_TAR}"
  chmod +x macos/exiftool
  echo "  ✅ macOS ExifTool $(macos/exiftool -ver)"
else
  echo "  ✓ macOS ExifTool $(macos/exiftool -ver) (schon vorhanden)"
fi

# ── Windows ──────────────────────────────────────────────────────────
# exiftool-X.YZ_64.zip = portable .exe mit eingebautem Perl. Native Binary,
# keine Runtime-Abhängigkeit.
if [ ! -f "windows/exiftool-${EXIFTOOL_VERSION}_64/exiftool.exe" ]; then
  echo "📥 Lade ExifTool ${EXIFTOOL_VERSION} (Windows) …"
  TMP_ZIP="windows-${EXIFTOOL_VERSION}.zip"
  curl -fsSL "https://exiftool.org/exiftool-${EXIFTOOL_VERSION}_64.zip" -o "${TMP_ZIP}"
  rm -rf windows
  mkdir -p windows
  unzip -q "${TMP_ZIP}" -d windows
  # Windows-ZIP enthält "exiftool(-k).exe" — umbenennen zu "exiftool.exe"
  if [ -f "windows/exiftool-${EXIFTOOL_VERSION}_64/exiftool(-k).exe" ]; then
    mv "windows/exiftool-${EXIFTOOL_VERSION}_64/exiftool(-k).exe" \
       "windows/exiftool-${EXIFTOOL_VERSION}_64/exiftool.exe"
  fi
  # Bloat raus
  rm -f "windows/exiftool-${EXIFTOOL_VERSION}_64/README.txt"
  rm -f "${TMP_ZIP}"
  echo "  ✅ Windows ExifTool ${EXIFTOOL_VERSION}"
else
  echo "  ✓ Windows ExifTool ${EXIFTOOL_VERSION} (schon vorhanden)"
fi

echo "✅ vendor/exiftool/ ready ($(du -sh "${VENDOR}" | cut -f1))"
