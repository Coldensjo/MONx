#!/bin/sh
# WebKitGTK's dmabuf renderer crashes under Wayland on this machine (Error 71),
# so run through XWayland with dmabuf disabled.
export GDK_BACKEND=x11
export WEBKIT_DISABLE_DMABUF_RENDERER=1
cd "$(dirname "$0")"
# `./monx.sh dev` runs the hot-reloading dev app (Vite + Tauri) instead of the
# release binary — no rebuild needed to see frontend changes.
if [ "$1" = "dev" ]; then
	shift
	exec bun run tauri:dev "$@"
fi
exec ./src-tauri/target/release/monx "$@"
