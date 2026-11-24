// ===== サッカー人生：ミニゲームのルール（PKチャレンジ・ルーレット） =====
// ゲーム内のお金だけを使う遊び。画面は pk.js・casino.js。
// core.js のあとに読み込む。core.js の内部の部品（SL._）を使い、作ったものを SL に足す。
'use strict';
(function (SL) {
  const { rnd, ri, chance } = SL._;
  // ===== PK戦チャレンジ（5本蹴ってゴール数で賞金。1節に1回） =====
  // キーパーが飛ぶ方向（dive）は蹴る側に見えない所で決める（オンラインはサーバー）
  const PK = { kicks: 5, perGoal: 4, perfect: 10, tol: { high: .12, low: .2 } };
  function pkDive() { const r = rnd(); return r < .4 ? 'L' : r < .8 ? 'R' : 'C'; }
  // kick = { dir: 'L'|'C'|'R', high: 上を狙ったか, power: 0〜1（真ん中の0.5がちょうどいい強さ） }
  function pkCheckKick(k) { return k && ['L', 'C', 'R'].includes(k.dir) && typeof k.high === 'boolean' && Number.isFinite(k.power) && k.power >= 0 && k.power <= 1; }
  function pkResult(k, dive) {
    if (Math.abs(k.power - .5) > (k.high ? PK.tol.high : PK.tol.low)) return { goal: false, why: k.power > .5 ? 'over' : 'weak', dive };
    // 同じ方向に飛ばれたら止められる。ただし上の隅は半分は届かない
    if (dive === k.dir && !(k.high && k.dir !== 'C' && chance(.5))) return { goal: false, why: 'saved', dive };
    return { goal: true, dive };
  }
  const pkReward = (goals) => goals * PK.perGoal + (goals === PK.kicks ? PK.perfect : 0);


  // ===== カジノ：ルーレット（ヨーロッパ式 0〜36。ゲーム内のお金だけを賭ける） =====
  const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const rlColor = (n) => n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black';
  // 賭け方：k は 'red' 'black' 'even' 'odd' 'low' 'high' 'd1' 'd2' 'd3' 'n0'〜'n36'。pay は当たったときに戻る倍率（賭け金込み）
  const RL_BETS = {
    red: { name: '赤', pay: 2, win: (n) => RL_RED.has(n) },
    black: { name: '黒', pay: 2, win: (n) => n > 0 && !RL_RED.has(n) },
    even: { name: '偶数', pay: 2, win: (n) => n > 0 && n % 2 === 0 },
    odd: { name: '奇数', pay: 2, win: (n) => n % 2 === 1 },
    low: { name: '1-18', pay: 2, win: (n) => n >= 1 && n <= 18 },
    high: { name: '19-36', pay: 2, win: (n) => n >= 19 },
    d1: { name: '1st 12', pay: 3, win: (n) => n >= 1 && n <= 12 },
    d2: { name: '2nd 12', pay: 3, win: (n) => n >= 13 && n <= 24 },
    d3: { name: '3rd 12', pay: 3, win: (n) => n >= 25 },
  };
  const ROULETTE = { minBet: 10, maxTotal: 10000, maxBets: 12, order: RL_ORDER };
  function rlBetInfo(k) {
    if (RL_BETS[k]) return RL_BETS[k];
    const m = /^n([0-9]{1,2})$/.exec(k);
    if (m && +m[1] <= 36) { const v = +m[1]; return { name: String(v), pay: 36, win: (n) => n === v }; }
    return null;
  }
  // 賭けを確かめる。おかしければエラー文を返す
  function rlCheck(p, bets) {
    if (!Array.isArray(bets) || !bets.length) return '賭けてください';
    if (bets.length > ROULETTE.maxBets) return `賭けは${ROULETTE.maxBets}か所まで`;
    let total = 0;
    for (const b of bets) {
      const a = Number(b && b.a);
      if (!rlBetInfo(b && b.k) || !Number.isInteger(a) || a < ROULETTE.minBet || a % 10) return '賭け方がおかしい';
      total += a;
    }
    if (total > ROULETTE.maxTotal) return "1回に賭けられるのは1億円まで";
    if (total > p.money) return 'お金が足りない';
    return null;
  }
  function spinRoulette(p, bets) {
    const e = rlCheck(p, bets);
    if (e) return { error: e };
    return resolveRoulette(p, bets, ri(0, 36));
  }
  // 出目 num で賭けを精算する（オンラインの共通の台は、全員に同じ num を使う）
  function resolveRoulette(p, bets, num) {
    let total = 0, back = 0;
    const results = bets.map((b) => {
      const info = rlBetInfo(b.k), a = Number(b.a), win = info.win(num), payout = win ? a * info.pay : 0;
      total += a; back += payout;
      return { k: b.k, name: info.name, a, win, payout };
    });
    p.money += back - total;
    const C = p.casino || (p.casino = { spins: 0, bet: 0, back: 0, best: 0 });
    C.spins++; C.bet += total; C.back += back; C.best = Math.max(C.best, back - total);
    return { num, color: rlColor(num), results, total, back, net: back - total, money: p.money };
  }

  Object.assign(SL, { PK, pkDive, pkCheckKick, pkResult, pkReward, ROULETTE, RL_BETS, rlColor, rlBetInfo, rlCheck, spinRoulette, resolveRoulette });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
