#!/usr/bin/env bash
# サッカー人生のテストをまとめて実行する
#   bash tests/soccer/run-all.sh          … ルール・セーブ・オンライン（手元のサーバーを起動）
#   bash tests/soccer/run-all.sh --quick  … オンライン以外（数秒）
set -e
cd "$(dirname "$0")/../.."
echo "== ルール（決まったシードの結果が記録と同じか）"; node tests/soccer/rules.test.js
echo "== 世界（クラブ・NPC・名簿）"; node tests/soccer/world.test.js
echo "== 試合（エンジン・PK・成績）"; node tests/soccer/match.test.js
echo "== 個人ランキング・個人賞"; node tests/soccer/awards.test.js
echo "== セーブデータ（読み込み・移行・バックアップ）"; node tests/soccer/save.test.js
if [ "$1" != "--quick" ]; then
  echo "== オンライン（手元で wrangler dev を起動して通しで確認）"; node tests/soccer/online.test.mjs 2>&1 | grep -v -e DEP0190 -e trace-deprecation
fi
echo "すべて通りました"
