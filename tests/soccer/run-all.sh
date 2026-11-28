#!/usr/bin/env bash
# サッカー人生のテストをまとめて実行する
#   bash tests/soccer/run-all.sh          … ルール・セーブ・オンライン（手元のサーバーを起動）
#   bash tests/soccer/run-all.sh --quick  … オンライン以外（数秒）
set -e
set -o pipefail # パイプの途中（node）の失敗も止める
cd "$(dirname "$0")/../.."
echo "== ルール（決まったシードの結果が記録と同じか）"; node tests/soccer/rules.test.js
echo "== 世界（クラブ・NPC・名簿）"; node tests/soccer/world.test.js
echo "== 試合（エンジン・PK・成績）"; node tests/soccer/match.test.js
echo "== 個人ランキング・個人賞"; node tests/soccer/awards.test.js
echo "== NPCの1年（成長・移籍・引退・30シーズン）"; node tests/soccer/life.test.js
echo "== オンラインのポジションの偏り対策（FWの上限・空き・狙い目）"; node --no-warnings tests/soccer/positions.test.mjs
echo "== 冬の移籍期間（第8〜10節）"; node tests/soccer/winter.test.js
echo "== 競馬（ミニゲーム）"; node tests/soccer/keiba.test.js
echo "== オンラインの移籍方針（オフに選ばなかったときの自動の決め方）"; node --no-warnings tests/soccer/policy.test.mjs
echo "== オンラインの称号図鑑（世代をまたいで集まる・オンライン専用の称号）"; node --no-warnings tests/soccer/olcol.test.mjs
echo "== オンラインのBチーム（満員でも引退させない・Bチームの試合・昇格）"; node --no-warnings tests/soccer/reserve.test.mjs
echo "== セーブデータ（読み込み・移行・バックアップ）"; node tests/soccer/save.test.js
if [ "$1" != "--quick" ]; then
  echo "== オンライン（手元で wrangler dev を起動して通しで確認）"; node tests/soccer/online.test.mjs 2>&1 | grep -v -e DEP0190 -e trace-deprecation
fi
echo "すべて通りました"
