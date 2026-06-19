Beobachtungen mit Ubuntu-24.04
==============================

## Fehler bei `pip install -r requirements.txt`

TODO Uli: Entweder Lösung finden oder Ticket erstellen!

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
