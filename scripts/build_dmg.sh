#!/usr/bin/env bash
# Reisezoom GPS Studio — DMG-Installer bauen
# Erzeugt ein .dmg mit Drag-to-Applications-Symbol für saubere Verteilung.
#
# Voraussetzung: ./build.sh wurde ausgeführt (also dist/Reisezoom GPS Studio.app existiert).
# Optional: `brew install create-dmg` für schickere Layouts; ansonsten Fallback
# auf hdiutil pur (funktioniert auch ohne extra Tools).
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

APPNAME="Reisezoom GPS Studio.app"
SRC_APP="dist/$APPNAME"

if [ ! -d "$SRC_APP" ]; then
  echo "❌ $SRC_APP nicht gefunden. Erst ./build.sh ausführen."
  exit 1
fi

# Version aus app.py ziehen (APP_VERSION = "x.y") für DMG-Dateinamen
VERSION=$(grep -m1 "^APP_VERSION" app.py | sed -E 's/.*"([^"]+)".*/\1/')
[ -z "$VERSION" ] && VERSION="0.0"

OUTDIR="dist/dmg"
DMG_NAME="ReisezoomGPSStudio-v${VERSION}.dmg"
DMG_PATH="$OUTDIR/$DMG_NAME"

mkdir -p "$OUTDIR"
rm -f "$DMG_PATH"

# Pfad 1: create-dmg (schickeres Layout — Background, Icon-Position)
if command -v create-dmg >/dev/null 2>&1; then
  echo "📦  Baue DMG mit create-dmg …"
  create-dmg \
    --volname "Reisezoom GPS Studio" \
    --window-pos 200 120 \
    --window-size 720 420 \
    --icon-size 120 \
    --icon "$APPNAME" 180 200 \
    --app-drop-link 540 200 \
    --hide-extension "$APPNAME" \
    --no-internet-enable \
    "$DMG_PATH" \
    "$SRC_APP"
else
  # Pfad 2: hdiutil-Fallback — funktioniert ohne Brew, einfaches Layout.
  echo "ℹ  create-dmg nicht installiert (brew install create-dmg für schickere Optik)."
  echo "📦  Baue DMG mit hdiutil …"

  STAGE="$OUTDIR/stage"
  rm -rf "$STAGE"
  mkdir -p "$STAGE"
  cp -R "$SRC_APP" "$STAGE/"
  # Drag-to-Applications-Symlink (DMG-Standard)
  ln -s /Applications "$STAGE/Applications"

  hdiutil create \
    -volname "Reisezoom GPS Studio" \
    -srcfolder "$STAGE" \
    -ov -format UDZO \
    "$DMG_PATH" >/dev/null

  rm -rf "$STAGE"
fi

# Codesign der DMG (ad-hoc, damit Gatekeeper nicht doppelt meckert)
codesign --force --sign - "$DMG_PATH" 2>/dev/null || true

SIZE=$(du -sh "$DMG_PATH" | cut -f1)
echo ""
echo "✅  DMG fertig: $DMG_PATH  ($SIZE)"
echo "   Zum Verteilen einfach diese Datei weitergeben."
echo "   Erstbenutzer rechtsklick → Öffnen (wegen fehlendem Apple Developer Cert)."
