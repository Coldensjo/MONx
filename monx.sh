#!/bin/sh
# Runs the hot-reloading dev app (Vite + Tauri) on Linux.
# WebKitGTK's dmabuf renderer crashes under Wayland on this machine (Error 71),
# so run through XWayland with dmabuf disabled.
export GDK_BACKEND=x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
cd "$(dirname "$0")"
exec bun run tauri:dev "$@"
