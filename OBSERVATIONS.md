Beobachtungen mit Ubuntu-24.04
==============================

## Fehler beim "Rendern"

- Browser für Render fehlt -> $HOME/.cache/ms-playwright
- In der Console:

  ```
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:27 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:27 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:27 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:27 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:29 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:22:37 [INFO] app: playwright_install_chromium: driver=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/node cli=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/package/cli.js
  2026-07-01 21:22:37 [INFO] app: playwright_install_chromium: cmd=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/node /home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/package/cli.js install chromium-headless-shell
  2026-07-01 21:22:37 [INFO] app: playwright_install_chromium: rc=0
  ```

- Leider klappt das Rendern nicht! Beim nächsten mal wird erneut die Fehlermeldung ausgegeben
- Download-Verzeichnis gelöscht, nochmals Render-Start
- Nun in der Console:

  ```
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:34 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:34 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:34 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:34 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  [pywebview] SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:37 [WARNING] pywebview: SAVE_DIALOG is deprecated and will be removed in a future version. Use 'FileDialog.SAVE' instead.
  2026-07-01 21:24:39 [INFO] app: playwright_install_chromium: driver=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/node cli=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/package/cli.js
  2026-07-01 21:24:39 [INFO] app: playwright_install_chromium: cmd=/home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/node /home/uli/git/forked/reisezoom-gps-studio/.venv/lib/python3.12/site-packages/playwright/driver/package/cli.js install chromium-headless-shell
  2026-07-01 21:24:56 [INFO] app: playwright_install_chromium: rc=0
  Downloading Chrome Headless Shell 148.0.7778.96 (playwright chromium-headless-shell v1223) from https://cdn.playwright.dev/builds/cft/148.0.7778.96/linux64/chrome-headless-shell-linux64.zip
  |                                                                                |   0% of 113.2 MiB
  |■■■■■■■■                                                                        |  10% of 113.2 MiB
  |■■■■■■■■■■■■■■■■                                                                |  20% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                                |  40% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                        |  50% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                                |  60% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                        |  70% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■                |  80% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■        |  90% of 113.2 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 113.2 MiB
  Chrome Headless Shell 148.0.7778.96 (playwright chromium-headless-shell v1223) downloaded to /home/uli/.cache/ms-playwright/chromium_headless_shell-1223
  Downloading FFmpeg (playwright ffmpeg v1011) from https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip
  |                                                                                |   0% of 2.3 MiB
  |■■■■■■■■                                                                        |  10% of 2.3 MiB
  |■■■■■■■■■■■■■■■■                                                                |  20% of 2.3 MiB
  |■■■■■■■■■■■■■■■■■■■■■■■■                                                        |  30% of
  ```

- Die 30% bleiben endlos stehen
- Verzeichnis $HOME/.cache/ms-playwright/ffmpeg-1011 löschen
- Render nochmal starten
- Jetzt geht FFmpeg bis 100%
- Leider funktioniert's immer noch nicht

## Fehler bei `pip install -r requirements.txt`

TODO Uli: Entweder Lösung finden oder Ticket erstellen!
- In einem neuen Container tritt das Problem nicht auf

```
$ pip install -r requirements.txt
WARNING: Skipping /usr/lib/python3.12/dist-packages/charset_normalizer-3.3.2.dist-info due to invalid metadata entry 'name'
WARNING: Skipping /usr/lib/python3.12/dist-packages/charset_normalizer-3.3.2.dist-info due to invalid metadata entry 'name'
Ignoring pyobjc: markers 'sys_platform == "darwin"' don't match your environment
Ignoring pywebview: markers 'sys_platform == "win32"' don't match your environment
Collecting pywebview>=6.0 (from -r requirements.txt (line 1))
...
 Attempting uninstall: greenlet
    Found existing installation: greenlet 3.0.3
    Not uninstalling greenlet at /usr/lib/python3/dist-packages, outside environment /home/uli/git/forked/reisezoom-gps-studio/.venv
    Can't uninstall 'greenlet'. No files were found to uninstall.
ERROR: pip's dependency resolver does not currently take into account all the packages that are installed. This behaviour is the source of the following dependency conflicts.
ocrmypdf 15.2.0+dfsg1 requires deprecation>=2.1.0, but you have deprecation 2.0.7 which is incompatible.
Successfully installed Pillow-12.2.0 PyQt6-6.11.0 PyQt6-Qt6-6.11.1 PyQt6-WebEngine-6.11.0 PyQt6-WebEngine-Qt6-6.11.1 PyQt6-sip-13.11.1 QtPy-2.4.3 bottle-0.13.4 fitdecode-0.11.0 gpxpy-1.6.2 greenlet-3.5.2 imageio-ffmpeg-0.6.0 piexif-1.1.3 pillow-heif-1.4.0 playwright-1.60.0 proxy_tools-0.1.0 pyee-13.0.1 pywebview-6.2.1 requests-2.34.2
```

Stimmt die Fehlermeldung? Nein, ich habe die Version 2.1.0-3 auf meinem Rechner

```
$ dpkg -l "*depre*"
Gewünscht=Unbekannt/Installieren/R=Entfernen/P=Vollständig Löschen/Halten
| Status=Nicht/Installiert/Config/U=Entpackt/halb konFiguriert/
         Halb installiert/Trigger erWartet/Trigger anhängig
|/ Fehler?=(kein)/R=Neuinstallation notwendig (Status, Fehler: GROSS=schlecht)
||/ Name                             Version      Architektur  Beschreibung
+++-================================-============-============-======================================================
un  python-is-python2-but-deprecated <keine>      <keine>      (keine Beschreibung vorhanden)
ii  python3-deprecated               1.2.14-1     all          Python decorator for old classes, functions or methods
ii  python3-deprecation              2.1.0-3      all          Library to handle automated deprecations
```

## Fehler beim Start mit `python app.py`

TODO Uli:

- Ist's ein Folgefehler vom vorigen? Nein! Hab's in einem neuen Container getestet
- Kann man's einfach korrigieren? OFFEN
- Ggf. Ticket erstellen

```
$ python app.py 
2026-06-19 16:45:10 [INFO] logger: ────────────────────────────────────────────────────────────
2026-06-19 16:45:10 [INFO] logger: Reisezoom GPS Studio gestartet — Logdatei: /home/uli/git/forked/reisezoom-gps-studio/logs/app.log
2026-06-19 16:45:10 [INFO] logger: OS: Linux Ubuntu 24.04 (x86_64) · kernel 6.17.0-35-generic
2026-06-19 16:45:10 [INFO] logger: Python 3.12.3 · pid=3702136
2026-06-19 16:45:10 [INFO] app: Playwright-Browser: /home/uli/.cache/ms-playwright (gebündelt=False)

(app.py:3702136): GLib-GIO-ERROR **: 16:45:11.009: g_menu_item_set_detailed_action: Detailed action name 'app._Hilfe_🌐_Blog_(reisezoom.com)' has invalid format: 0-9:unknown keyword
Trace/Breakpoint ausgelöst
```

### Copilot - Frage

Beim Start unter Linux bekomme ich eine Fehlermeldung mit "(app.py:4112): GLib-GIO-ERROR **: 15:12:12.279: g_menu_item_set_detailed_action: Detailed action name 'app._Help_🌐_Blog_(reisezoom.com)' has invalid format: 0-9:unknown keyword". Wie kann ich das korrigieren?

### Copilot - Antwort

Das Problem liegt an der Menü-Definition für macOS bei den externen Links. Die Fehlermeldung besagt, dass die Aktion 'app._Help_🌐_Blog_(reisezoom.com)' ein ungültiges Format hat.

Die Ursache ist auf Zeile 4124 zu finden — dort wird ein String mit Emojis und Sonderzeichen in eine GLib-Aktion konvertiert, die nur ASCII-Zeichen akzeptiert.

Hier die Lösung:

(Copilot is reponding...)
