#!/usr/bin/env bash
# サッカー人生オンラインリーグの全データを書き出して、手元に保存する（バックアップ）
#   bash tools/soccer-backup.sh
# 管理用の合言葉は .secrets/soccer-admin-key（Gitに入らない）。保存先は private/backups/（Gitに入らない）。
# 移行版を公開する前には必ず実行し、ファイルができたことを確かめる。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_FILE="$ROOT/.secrets/soccer-admin-key"
API="${SOCCER_API:-https://tonmatolab-soccer.tonmatolab.workers.dev}"
[ -f "$KEY_FILE" ] || { echo "合言葉のファイルがありません: $KEY_FILE"; exit 1; }
mkdir -p "$ROOT/private/backups"
OUT="$ROOT/private/backups/soccer-online-$(date +%Y%m%d-%H%M%S).json"
code=$(curl -s -o "$OUT" -w '%{http_code}' -H "X-Admin-Key: $(cat "$KEY_FILE")" "$API/api/admin/export")
if [ "$code" != "200" ]; then echo "書き出しに失敗しました（HTTP $code）"; rm -f "$OUT"; exit 1; fi
node -e "const d=require(process.argv[1]); if(d.app!=='soccer-online'||!d.world) { console.error('中身がおかしい'); process.exit(1); } const w=JSON.parse(d.world); console.log('保存しました:', process.argv[1]); console.log('  アカウント', d.accounts.length, '/ 選手', d.players.length, '（現役', d.players.filter(p=>p.active).length + '）/ リーグ', w.year + '年', w.phase, '第' + w.week + '節');" "$OUT"
