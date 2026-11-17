#!/usr/bin/env bash
# 名将ガチャの武将生成・合戦ロジックを、サーバー（counter-api）にも同じものとしてコピーする
# bushou/gen.js か bushou/battle.js を変えたら必ず実行して、counter-api をデプロイし直すこと
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/counter-api/src/bushou-core.js"
{
  echo "// 自動生成ファイル：tools/sync-bushou-core.sh で bushou/gen.js と bushou/battle.js から作る。直接編集しないこと"
  cat "$ROOT/bushou/gen.js"
  echo
  cat "$ROOT/bushou/battle.js"
  echo
  echo "export { makeBushou, normName, seeded, simulateBattle, RARITIES };"
} > "$OUT"
echo "wrote $OUT"
