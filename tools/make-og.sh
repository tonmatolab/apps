#!/usr/bin/env bash
# 使い方: bash tools/make-og.sh coffee-shindan
# <app>/og.html を 1200x630 の <app>/og.png に書き出す（X/LINE等のシェア用サムネ）
set -e
APP="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
WIN_ROOT="$(cygpath -m "$ROOT")"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=4000 \
  --screenshot="$WIN_ROOT/$APP/og.png" "file:///$WIN_ROOT/$APP/og.html"
echo "wrote $APP/og.png"
