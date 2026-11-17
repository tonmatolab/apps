#!/usr/bin/env bash
# 使い方: bash tools/deploy-cf.sh
# Git管理されている公開ファイルだけを dist にコピーして Cloudflare に公開する
# （private/・counter-api/・tools/・.claude/ などは絶対に含めない）
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/.dist"
rm -rf "$DIST" && mkdir -p "$DIST"
cd "$ROOT"
git ls-files | grep -vE '^(private/|counter-api/|tools/|\.claude/|\.secrets/|\.gitignore$|README\.md$|.*/og\.html$)' | while read -r f; do
  mkdir -p "$DIST/$(dirname "$f")"; cp "$f" "$DIST/$f"
done
echo "files: $(find "$DIST" -type f | wc -l)"
npx -y wrangler@4 deploy --name tonmatolab --assets "$DIST" --compatibility-date 2026-10-01
