// 競馬（ミニゲーム）のルール
//   node tests/soccer/keiba.test.js
'use strict';
const { seeded, check, failed } = require('./lib');
const SL = require('./sl');

SL.setRng(seeded(777));
const card = SL.newKeibaCard(1);

// 出走表
check(card.horses.length === 8 && card.horses.every((h, i) => h.no === i + 1), '8頭・馬番1〜8');
check(new Set(card.horses.map((h) => h.name)).size === 8, '馬の名前は重ならない');
check(card.horses.every((h) => h.win >= 1.1 && h.place >= 1.1 && h.place <= h.win), 'オッズ：単勝・複勝とも1.1倍以上、複勝は単勝より低い');
check(Object.keys(card.pairs).length === 28, '馬連は28通り');
check(card.horses.map((h) => h.pop).sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8', '人気は1〜8番人気');
const fav = card.horses.find((h) => h.pop === 1);
check(card.horses.every((h) => h.win >= fav.win), '1番人気は単勝オッズがいちばん低い');
const pub = SL.keibaPublic(card);
check(pub.horses.every((h) => !('str' in h)) && card.horses.every((h) => h.str > 0), '画面に送る出走表には馬の力がない（元の出走表には残る）');

// 馬券の確かめ
const p = { money: 1000 };
check(SL.keibaCheck(p, card, []) === '賭けてください', '馬券なしはだめ');
check(SL.keibaCheck(p, card, [{ k: 'w9', a: 10 }]) === '賭け方がおかしい', 'ない馬はだめ');
check(SL.keibaCheck(p, card, [{ k: 'q2-1', a: 10 }]) === '賭け方がおかしい', '馬連は小さい番号が先');
check(SL.keibaCheck(p, card, [{ k: 'w1', a: 15 }]) === '賭け方がおかしい', '10万円単位');
check(SL.keibaCheck(p, card, [{ k: 'w1', a: 10 }, { k: 'w1', a: 10 }]) === '賭け方がおかしい', '同じ馬券を2つに分けない');
check(SL.keibaCheck({ money: 100 }, card, [{ k: 'w1', a: 500 }]) === 'お金が足りない', 'お金が足りなければだめ');
check(SL.keibaCheck({ money: 1e9 }, card, [{ k: 'w1', a: 1010 }]) === '1レースに賭けられるのは1,000万円まで', '1レース1,000万円まで');
check(SL.keibaCheck(p, card, Array.from({ length: 9 }, (_, i) => ({ k: i < 8 ? `w${i + 1}` : 'p1', a: 10 }))) === '馬券は8点まで', '8点まで');

// 精算
{
  const order = [3, 5, 1, 2, 4, 6, 7, 8];
  const q = { money: 1000 };
  const r = SL.resolveKeiba(q, card, [{ k: 'w3', a: 100 }, { k: 'p1', a: 100 }, { k: 'p2', a: 100 }, { k: 'q3-5', a: 100 }], order);
  const h = card.horses;
  const expect = Math.round(100 * h[2].win) + Math.round(100 * h[0].place) + Math.round(100 * card.pairs['3-5']);
  check(r.back === expect && r.total === 400 && q.money === 1000 - 400 + expect, `払い戻し＝賭け金×オッズ（単勝3・複勝1・馬連3-5が当たり、複勝2は外れ）`);
  check(r.results.map((x) => x.win).join() === 'true,true,false,true', '当たり外れ');
  check(q.keiba.races === 1 && q.keiba.bet === 400 && q.keiba.back === expect, '成績が残る');
}
// 長い目で見ると、払い戻しは賭け金の8割くらい（ゲーム内のお金が増えすぎない）
{
  let bet = 0, back = 0;
  for (let i = 0; i < 300; i++) {
    const c = SL.newKeibaCard(i), o = SL.keibaOrder(c);
    for (const h of c.horses) { bet += 20; back += (o[0] === h.no ? 10 * h.win : 0) + (o.slice(0, 3).includes(h.no) ? 10 * h.place : 0); }
  }
  const rate = back / bet;
  check(rate > .7 && rate < .92, `払い戻し率 ${(rate * 100).toFixed(1)}%（70〜92%）`);
}
// 一人用：その場で走る
{
  const q = { money: 500 };
  const r = SL.runKeiba(q, card, [{ k: 'w1', a: 100 }]);
  check(r.order.length === 8 && new Set(r.order).size === 8 && q.money === 400 + r.back, '一人用はその場で着順が決まり、お金が動く');
  check(SL.runKeiba({ money: 50 }, card, [{ k: 'w1', a: 100 }]).error === 'お金が足りない', 'お金が足りなければ走らない');
}

console.log(`keiba: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
