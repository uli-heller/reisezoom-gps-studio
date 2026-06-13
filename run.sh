#!/usr/bin/env bash
# Reisezoom GPS Studio — Launcher
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
if [ ! -d ".venv" ]; then
  echo "Setze venv auf …"
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -q --upgrade pip
  pip install -q pywebview gpxpy piexif Pillow playwright pyobjc requests
  playwright install chromium
else
  source .venv/bin/activate
fi
exec python app.py
