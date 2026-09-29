#!/usr/bin/env bash
# Virtual display + window manager + VNC + noVNC + the Playwright browser server.
set -eu
export DISPLAY=:1
Xvfb :1 -screen 0 1280x860x24 -nolisten tcp &
sleep 0.5
openbox &
x11vnc -display :1 -forever -shared -nopw -localhost -quiet &
websockify --web /usr/share/novnc 6080 localhost:5900 &
exec node /app/docker/browser-server.mjs
