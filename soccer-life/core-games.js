// ===== サッカー人生：ミニゲームのルール（PKチャレンジ・ルーレット） =====
// ゲーム内のお金だけを使う遊び。画面は pk.js・casino.js。
// core.js のあとに読み込む。core.js の内部の部品（SL._）を使い、作ったものを SL に足す。
'use strict';
(function (SL) {
  const { rnd, ri, chance, pick } = SL._;
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
  const ROULETTE = { minBet: 10, maxTotal: 1000, maxBets: 12, order: RL_ORDER };
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
    if (total > ROULETTE.maxTotal) return "1回に賭けられるのは1,000万円まで";
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

  // ===== 競馬（8頭のレース。単勝・複勝・馬連。オッズは出走表を作ったときに決まる＝固定オッズ） =====
  // 馬の名前・レース名はすべて架空。ゲーム内のお金だけを賭ける
  const KEIBA = { horses: 8, minBet: 10, maxTotal: 1000, maxBets: 8, rate: 0.85, sims: 3000, sigma: 8 };
  const HORSE_A = ['サンダー', 'ミラクル', 'スター', 'ブルー', 'レッド', 'シルバー', 'ハヤテ', 'ツバサ', 'アオゾラ', 'ヒカリ', 'カゼノ', 'ユメノ', 'ホシノ', 'ムーン', 'ロイヤル', 'マジカル', 'ラッキー', 'トップ', 'ドリーム', 'ソラノ', 'コハク', 'ナギサ'];
  const HORSE_B = ['ランナー', 'ボルト', 'ウイング', 'ダッシュ', 'ハート', 'ロード', 'ソング', 'フラッシュ', 'ステップ', 'キッド', 'チャンス', 'ジェット', 'ファイター', 'ヒーロー', 'メロディ', 'スマイル', 'ロケット', 'タイフーン', 'プリンス', 'ビート', 'リズム', 'パレード'];
  const RACE_NAMES = ['ルーキーステークス', 'スプリント杯', 'とんまと記念', 'ゴールデンカップ', '星空賞', 'ドリームレース', 'グランプリ', 'サンライズ特別', 'ムーンライト賞', '若葉ステークス', 'チャレンジカップ', '月夜特別'];
  const COURSES = ['芝1200m', '芝1600m', '芝2000m', '芝2400m', 'ダート1400m', 'ダート1800m'];
  const STYLES = ['逃げ', '先行', '差し', '追込'];
  const odds1 = (x) => Math.round(x * 10) / 10;
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  // 1レース：力に、その日の出来（ゆらぎ）を足して、高い順にゴール。着順（馬番の配列）を返す
  function keibaOrder(card, r = rnd) {
    const g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return card.horses.map((h) => ({ no: h.no, v: h.str + g() * KEIBA.sigma })).sort((x, y) => y.v - x.v).map((x) => x.no);
  }
  // 出走表を作る（馬・オッズ）。オッズは何千回もレースを回して勝つ割合から決める（払い戻し率 rate）
  function newKeibaCard(round = 1) {
    const used = new Set(), horses = [];
    for (let no = 1; no <= KEIBA.horses; no++) {
      let name; do name = pick(HORSE_A) + pick(HORSE_B); while (used.has(name)); used.add(name);
      horses.push({ no, name, str: ri(62, 82), style: pick(STYLES) });
    }
    const card = { round, name: pick(RACE_NAMES), course: pick(COURSES), horses };
    const N = KEIBA.sims, win = {}, top3 = {}, pair = {};
    for (let i = 0; i < N; i++) {
      const o = keibaOrder(card);
      win[o[0]] = (win[o[0]] || 0) + 1;
      for (const x of o.slice(0, 3)) top3[x] = (top3[x] || 0) + 1;
      const k = pairKey(o[0], o[1]); pair[k] = (pair[k] || 0) + 1;
    }
    const od = (n, lo, hi) => Math.min(hi, Math.max(lo, odds1(KEIBA.rate / (Math.max(n, .5) / N))));
    for (const h of horses) { h.win = od(win[h.no] || 0, 1.1, 999.9); h.place = od(top3[h.no] || 0, 1.1, 99.9); }
    // 人気（単勝オッズの低い順）
    horses.slice().sort((x, y) => x.win - y.win).forEach((h, i) => { h.pop = i + 1; });
    card.pairs = {};
    for (let a = 1; a <= KEIBA.horses; a++) for (let b = a + 1; b <= KEIBA.horses; b++) card.pairs[pairKey(a, b)] = od(pair[pairKey(a, b)] || 0, 1.5, 9999.9);
    return card;
  }
  // 画面に送る出走表（馬の力 str は見せない。オッズと人気で読む）
  const keibaPublic = (card) => card && { ...card, horses: card.horses.map(({ str, ...h }) => h) };
  function keibaBetInfo(card, k) {
    let m = /^([wp])([1-8])$/.exec(k);
    if (m) {
      const h = card.horses[+m[2] - 1]; if (!h) return null;
      return m[1] === 'w' ? { name: `単勝 ${h.no} ${h.name}`, odds: h.win, win: (o) => o[0] === h.no }
        : { name: `複勝 ${h.no} ${h.name}`, odds: h.place, win: (o) => o.slice(0, 3).includes(h.no) };
    }
    m = /^q([1-8])-([1-8])$/.exec(k);
    if (m && +m[1] < +m[2] && card.pairs[k.slice(1)]) { const a = +m[1], b = +m[2]; return { name: `馬連 ${a}-${b}`, odds: card.pairs[k.slice(1)], win: (o) => pairKey(o[0], o[1]) === pairKey(a, b) }; }
    return null;
  }
  function keibaCheck(p, card, bets) {
    if (!Array.isArray(bets) || !bets.length) return '賭けてください';
    if (bets.length > KEIBA.maxBets) return `馬券は${KEIBA.maxBets}点まで`;
    let total = 0; const seen = new Set();
    for (const b of bets) {
      const a = Number(b && b.a);
      if (!keibaBetInfo(card, b && b.k) || seen.has(b.k) || !Number.isInteger(a) || a < KEIBA.minBet || a % 10) return '賭け方がおかしい';
      seen.add(b.k); total += a;
    }
    if (total > KEIBA.maxTotal) return '1レースに賭けられるのは1,000万円まで';
    if (total > p.money) return 'お金が足りない';
    return null;
  }
  // 着順 order で精算する（オンラインは全員に同じ着順を使う）
  function resolveKeiba(p, card, bets, order) {
    let total = 0, back = 0;
    const results = bets.map((b) => {
      const info = keibaBetInfo(card, b.k), a = Number(b.a), win = info.win(order), payout = win ? Math.round(a * info.odds) : 0;
      total += a; back += payout;
      return { k: b.k, name: info.name, a, odds: info.odds, win, payout };
    });
    p.money += back - total;
    const K = p.keiba || (p.keiba = { races: 0, bet: 0, back: 0, best: 0, bestOdds: 0 });
    K.races++; K.bet += total; K.back += back; K.best = Math.max(K.best, back - total);
    for (const r of results) if (r.win) K.bestOdds = Math.max(K.bestOdds, r.odds);
    return { order, results, total, back, net: back - total, money: p.money };
  }
  // 一人用：その場で走らせる
  function runKeiba(p, card, bets) {
    const e = keibaCheck(p, card, bets);
    if (e) return { error: e };
    return resolveKeiba(p, card, bets, keibaOrder(card));
  }

  Object.assign(SL, { KEIBA, newKeibaCard, keibaPublic, keibaOrder, keibaBetInfo, keibaCheck, resolveKeiba, runKeiba,
    PK, pkDive, pkCheckKick, pkResult, pkReward, ROULETTE, RL_BETS, rlColor, rlBetInfo, rlCheck, spinRoulette, resolveRoulette });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
