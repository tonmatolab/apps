// ===== カジノ：ルーレットの画面（一人用・オンライン共通） =====
// openRoulette({ getMoney, spinsLeft, spin, onClose })
//   getMoney()   … 今の所持金（万円）
//   spinsLeft()  … あと何回回せるか（制限なしなら null）
//   spin(bets)   … 1回まわす。{ num, color, results, total, back, net, money } か { error } を返す（Promise でもよい）
//   onClose()    … 閉じたあとに呼ぶ
// ゲーム内のお金だけを賭ける。当たり外れは core.js の spinRoulette（オンラインはサーバー）が決める。
'use strict';
(() => {
  const CHIPS = [10, 50, 100, 500, 1000]; // 1回に賭けられるのは1,000万円まで
  const SEG = 360 / 37;
  const fmt = (v) => (v >= 10000 ? `${(v / 10000).toFixed(v % 10000 ? 1 : 0)}億` : `${v.toLocaleString()}万`) + '円';
  const colorOf = (n) => SL.rlColor(n);
  const fill = { red: '#d33b2c', black: '#1f2328', green: '#17924c' };

  function wheelSVG() {
    const R = 120, r2 = 86, cx = 130, cy = 130;
    const pt = (a, rad) => [cx + rad * Math.sin(a * Math.PI / 180), cy - rad * Math.cos(a * Math.PI / 180)];
    let segs = '';
    SL.ROULETTE.order.forEach((n, i) => {
      const a0 = i * SEG - SEG / 2, a1 = a0 + SEG;
      const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [x2, y2] = pt(a1, r2), [x3, y3] = pt(a0, r2);
      segs += `<path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r2} ${r2} 0 0 0 ${x3} ${y3}Z" fill="${fill[colorOf(n)]}" stroke="#c9a227" stroke-width=".8"/>`;
      const [tx, ty] = pt(i * SEG, 103);
      segs += `<text x="${tx}" y="${ty}" transform="rotate(${i * SEG} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="800" fill="#fff" font-family="Outfit,sans-serif">${n}</text>`;
    });
    return `<svg viewBox="0 0 260 260" class="rl-wheel"><circle cx="130" cy="130" r="128" fill="#6b3f1d"/><g class="rl-rot">${segs}
      <circle cx="130" cy="130" r="86" fill="#8a5a2b"/><circle cx="130" cy="130" r="60" fill="#5a3415"/>
      ${[0, 90, 180, 270].map((a) => `<rect x="127" y="76" width="6" height="108" rx="3" fill="#d9b44a" transform="rotate(${a + 45} 130 130)"/>`).join('')}
      <circle cx="130" cy="130" r="14" fill="#d9b44a"/></g>
      <path d="M130 2 L121 18 L139 18 Z" fill="#fff" stroke="#333" stroke-width="1.5"/></svg>`;
  }

  window.openRoulette = function openRoulette(opt) {
    let bets = {}, chip = 100, rot = 0, spinning = false, last = null;
    const hist = [];
    const bg = document.createElement('div'); bg.className = 'ov-bg';
    const outside = Object.entries(SL.RL_BETS).map(([k, b]) => `<button class="rl-cell rl-out rl-${k}" data-k="${k}">${b.name}<small>×${b.pay}</small><i></i></button>`).join('');
    const nums = Array.from({ length: 36 }, (_, i) => i + 1).map((n) => `<button class="rl-cell rl-num rl-c-${colorOf(n)}" data-k="n${n}">${n}<i></i></button>`).join('');
    bg.innerHTML = `<div class="sheet casino">
      <div class="rl-head"><b>🎰 ルーレット</b><span class="rl-money"></span></div>
      <div class="rl-wheelbox">${wheelSVG()}</div>
      <div class="rl-result">賭けてから「まわす」</div>
      <div class="rl-hist"></div>
      <div class="rl-chips">${CHIPS.map((c) => `<button data-c="${c}">${fmt(c).replace('円', '')}</button>`).join('')}</div>
      <div class="rl-board"><button class="rl-cell rl-num rl-c-green rl-zero" data-k="n0">0<i></i></button>${nums}</div>
      <div class="rl-outs">${outside}</div>
      <div class="rl-sum"></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="clear">クリア</button><button class="btn" data-act="again">前回と同じ</button></div>
      <button class="btn gold rl-spin" data-act="spin" style="margin-top:10px">まわす！</button>
      <p class="sub" style="text-align:center;margin:8px 0 0">数字1つは36倍、1st 12などは3倍、赤・黒などは2倍。0のときは数字の0以外すべて外れ<br>※ゲーム内のお金だけを使います</p>
      <button class="btn ghost" data-act="close">カジノを出る</button></div>`;
    document.body.appendChild(bg);
    const $q = (s) => bg.querySelector(s);
    const rotG = $q('.rl-rot');

    const total = () => Object.values(bets).reduce((a, b) => a + b, 0);
    function paint() {
      const left = opt.spinsLeft ? opt.spinsLeft() : null;
      $q('.rl-money').innerHTML = `所持金 <b>${fmt(opt.getMoney())}</b>${left != null ? `<br><small>今節あと${left}回</small>` : ''}`;
      bg.querySelectorAll('.rl-chips button').forEach((b) => b.classList.toggle('on', +b.dataset.c === chip));
      bg.querySelectorAll('.rl-cell').forEach((b) => { const v = bets[b.dataset.k]; b.classList.toggle('bet', !!v); b.querySelector('i').textContent = v ? fmt(v).replace('円', '') : ''; });
      const t = total();
      $q('.rl-sum').innerHTML = t ? `賭け金 合計 <b>${fmt(t)}</b>（${Object.keys(bets).length}か所）` : '<span class="sub">チップを選んで、賭けたい場所をタップ</span>';
      $q('.rl-spin').disabled = spinning || !t || (left != null && left <= 0);
      $q('[data-act="again"]').disabled = spinning || !last;
      $q('.rl-hist').innerHTML = hist.map((n) => `<span class="rl-h rl-c-${colorOf(n)}">${n}</span>`).join('');
    }
    function addBet(k) {
      if (spinning) return;
      const next = (bets[k] || 0) + chip;
      if (!bets[k] && Object.keys(bets).length >= SL.ROULETTE.maxBets) return flash(`賭けは${SL.ROULETTE.maxBets}か所まで`);
      if (total() + chip > Math.min(opt.getMoney(), SL.ROULETTE.maxTotal)) return flash(opt.getMoney() < total() + chip ? 'お金が足りない' : '1回に賭けられるのは1,000万円まで');
      bets[k] = next; paint();
    }
    function flash(t) { const el = $q('.rl-result'); el.textContent = t; el.className = 'rl-result warn'; }
    async function doSpin() {
      if (spinning || !total()) return;
      spinning = true; paint();
      const list = Object.entries(bets).map(([k, a]) => ({ k, a }));
      $q('.rl-result').textContent = '…'; $q('.rl-result').className = 'rl-result';
      const r = await opt.spin(list);
      if (!r || r.error) { spinning = false; flash((r && r.error) || '通信できませんでした'); paint(); return; }
      // 当たった番号が上の矢印に来るように回す
      const i = SL.ROULETTE.order.indexOf(r.num);
      const want = ((-i * SEG - rot) % 360 + 360) % 360;
      rot += 360 * 5 + want;
      rotG.style.transition = 'transform 3.2s cubic-bezier(.12,.75,.15,1)';
      rotG.style.transform = `rotate(${rot}deg)`;
      await new Promise((ok) => setTimeout(ok, 3300));
      hist.unshift(r.num); if (hist.length > 12) hist.pop();
      const col = { red: '赤', black: '黒', green: '緑' }[r.color];
      const wins = r.results.filter((x) => x.win);
      const el = $q('.rl-result');
      el.className = `rl-result ${r.net > 0 ? 'win' : r.net < 0 ? 'lose' : ''}`;
      el.innerHTML = `<b class="rl-big rl-c-${r.color}">${r.num}</b> ${col}　${r.net > 0 ? `🎉 +${fmt(r.net)}` : r.net < 0 ? `−${fmt(-r.net)}` : '±0'}${wins.length ? `<br><small>当たり：${wins.map((x) => `${x.name}（${fmt(x.payout)}）`).join('・')}</small>` : ''}`;
      last = list; bets = {}; spinning = false; paint();
    }

    bg.addEventListener('click', (e) => {
      const cell = e.target.closest('.rl-cell'); if (cell) return addBet(cell.dataset.k);
      // 以下はその場で回す台（一人用）の操作
      const c = e.target.closest('.rl-chips button'); if (c) { chip = +c.dataset.c; return paint(); }
      const act = e.target.closest('[data-act]'); if (!act) return;
      const a = act.dataset.act;
      if (a === 'clear' && !spinning) { bets = {}; paint(); }
      if (a === 'again' && !spinning && last) {
        const sum = last.reduce((x, y) => x + y.a, 0);
        if (sum > opt.getMoney()) return flash('お金が足りない');
        bets = Object.fromEntries(last.map((b) => [b.k, b.a])); paint();
      }
      if (a === 'spin') doSpin();
      if (a === 'close' && !spinning) { bg.remove(); if (opt.onClose) opt.onClose(); }
    });
    paint();
  };

  // ===== オンライン：全員共通の台（一定時間ごとにサーバーが1回だけ回す） =====
  // openRouletteTable({ load, bet, onClose })
  //   load()      … 台の状態を取ってくる { now, nextAt, round, intervalMin, last, hist, players, myBets, myLast, money } か { error }
  //   bet(bets)   … 次の回への賭けを確定する（[] で取り消し）。返り値は load と同じ
  // 結果を取りに行くのは、この画面を開いている間に「回る時刻を過ぎたとき」だけ（無料枠を守る）
  window.openRouletteTable = async function openRouletteTable(opt) {
    let T = null, skew = 0, bets = {}, chip = 100, rot = 0, shown = 0, busy = false, fetching = false, lastFetch = 0, prevBets = null, fails = 0;
    const bg = document.createElement('div'); bg.className = 'ov-bg';
    const outside = Object.entries(SL.RL_BETS).map(([k, b]) => `<button class="rl-cell rl-out rl-${k}" data-k="${k}">${b.name}<small>×${b.pay}</small><i></i></button>`).join('');
    const nums = Array.from({ length: 36 }, (_, i) => i + 1).map((n) => `<button class="rl-cell rl-num rl-c-${colorOf(n)}" data-k="n${n}">${n}<i></i></button>`).join('');
    bg.innerHTML = `<div class="sheet casino">
      <div class="rl-head"><b>🎰 みんなのルーレット</b><span class="rl-money"></span></div>
      <div class="rl-timer"></div>
      <div class="rl-wheelbox">${wheelSVG()}</div>
      <div class="rl-result">読み込み中…</div>
      <div class="rl-hist"></div>
      <div class="rl-winners"></div>
      <div class="rl-chips">${CHIPS.map((c) => `<button data-c="${c}">${fmt(c).replace('円', '')}</button>`).join('')}</div>
      <div class="rl-board"><button class="rl-cell rl-num rl-c-green rl-zero" data-k="n0">0<i></i></button>${nums}</div>
      <div class="rl-outs">${outside}</div>
      <div class="rl-sum"></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="clear">クリア</button><button class="btn" data-act="again">前回と同じ</button></div>
      <button class="btn gold" data-act="confirm" style="margin-top:10px">この賭けで確定</button>
      <button class="btn ghost" data-act="cancel">賭けを取り消す</button>
      <p class="sub" style="text-align:center;margin:8px 0 0">台は全員共通で、決まった時刻に1回だけ回ります。お金が動くのは回った瞬間（それまでは何度でも賭け直せる）<br>数字1つは36倍、1st 12などは3倍、赤・黒などは2倍。※ゲーム内のお金だけを使います</p>
      <button class="btn ghost" data-act="close">カジノを出る</button></div>`;
    document.body.appendChild(bg);
    const $q = (s) => bg.querySelector(s);
    const rotG = $q('.rl-rot');
    const total = () => Object.values(bets).reduce((a, b) => a + b, 0);
    const confirmed = () => T && JSON.stringify(Object.fromEntries(T.myBets.map((b) => [b.k, b.a]))) === JSON.stringify(bets);
    const turnTo = (num, animate) => {
      const i = SL.ROULETTE.order.indexOf(num);
      rot += (animate ? 360 * 5 : 0) + ((-i * SEG - rot) % 360 + 360) % 360;
      rotG.style.transition = animate ? 'transform 3.2s cubic-bezier(.12,.75,.15,1)' : 'none';
      rotG.style.transform = `rotate(${rot}deg)`;
    };
    function flash(t) { const el = $q('.rl-result'); el.textContent = t; el.className = 'rl-result warn'; }
    function resultText() {
      const L = T.last, my = T.myLast;
      if (!L) return '<span class="sub">まだ1回も回っていません</span>';
      const col = { red: '赤', black: '黒', green: '緑' }[L.color];
      let mine = '<small>この回は賭けていません</small>';
      if (my && my.round === L.round) {
        if (my.void) mine = `<small>賭けは無効になりました（${esc(my.void)}）</small>`;
        else {
          const wins = (my.results || []).filter((x) => x.win);
          mine = `${my.net > 0 ? `🎉 +${fmt(my.net)}` : my.net < 0 ? `−${fmt(-my.net)}` : '±0'}${wins.length ? `<br><small>当たり：${wins.map((x) => `${x.name}（${fmt(x.payout)}）`).join('・')}</small>` : ''}`;
        }
      }
      return `<small>第${L.round}回</small> <b class="rl-big rl-c-${L.color}">${L.num}</b> ${col}<br>${mine}`;
    }
    function paint() {
      if (!T) return;
      const money = T.money;
      $q('.rl-money').innerHTML = `所持金 <b>${fmt(money)}</b>`;
      const my = T.myLast && T.last && T.myLast.round === T.last.round ? T.myLast.net : 0;
      $q('.rl-result').className = `rl-result ${my > 0 ? 'win' : my < 0 ? 'lose' : ''}`;
      $q('.rl-hist').innerHTML = T.hist.map((n) => `<span class="rl-h rl-c-${colorOf(n)}">${n}</span>`).join('');
      const W = T.last && T.last.winners || [];
      $q('.rl-winners').innerHTML = W.length ? `<div class="sub" style="text-align:center">第${T.last.round}回の大当たり：${W.map((x) => `${esc(x.name)} +${fmt(x.net)}`).join('・')}</div>` : '';
      bg.querySelectorAll('.rl-chips button').forEach((b) => b.classList.toggle('on', +b.dataset.c === chip));
      bg.querySelectorAll('.rl-cell').forEach((b) => { const v = bets[b.dataset.k]; b.classList.toggle('bet', !!v); b.querySelector('i').textContent = v ? fmt(v).replace('円', '') : ''; });
      const t = total(), ok = confirmed();
      $q('.rl-sum').innerHTML = t ? `第${T.round}回への賭け 合計 <b>${fmt(t)}</b>（${Object.keys(bets).length}か所）　${ok ? '<span style="color:#7be3a5">✅ 確定済み</span>' : '<span style="color:#ffb37a">まだ確定していません</span>'}`
        : T.myBets.length ? '<span style="color:#ffb37a">賭けを取り消すには「賭けを取り消す」</span>' : '<span class="sub">チップを選んで、賭けたい場所をタップ → 「この賭けで確定」</span>';
      $q('[data-act="confirm"]').disabled = busy || !t || ok;
      $q('[data-act="cancel"]').style.display = T.myBets.length ? '' : 'none';
      $q('[data-act="again"]').disabled = busy || !prevBets;
      tickTimer();
    }
    function tickTimer() {
      if (!T) return;
      const left = T.nextAt - (Date.now() + skew);
      const s = Math.max(0, Math.ceil(left / 1000));
      $q('.rl-timer').innerHTML = left > 0 ? `第${T.round}回まで <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>・${T.players}人が賭けています` : `第${T.round}回、まわっています…`;
    }
    function apply(j, animate) {
      const newRound = j.last && j.last.round > shown;
      T = j; skew = j.now - Date.now(); lastFetch = Date.now();
      if (!prevBets && j.myLast && j.myLast.results) prevBets = j.myLast.results.map((x) => ({ k: x.k, a: x.a }));
      if (j.myBets.length) bets = Object.fromEntries(j.myBets.map((b) => [b.k, b.a]));
      if (newRound) {
        shown = j.last.round;
        turnTo(j.last.num, animate);
        if (animate) { $q('.rl-result').textContent = 'まわっています…'; setTimeout(() => { $q('.rl-result').innerHTML = resultText(); paint(); }, 3300); }
        else $q('.rl-result').innerHTML = resultText();
      }
      paint();
    }
    async function refresh(animate) {
      if (fetching) return; fetching = true; lastFetch = Date.now(); // 失敗しても、すぐにはやり直さない
      const j = await opt.load();
      fetching = false;
      if (!j || j.error) { fails++; flash((j && j.error) || '通信できませんでした'); return; }
      fails = 0;
      const before = shown;
      if (animate && j.last && j.last.round > before && !j.myBets.length) bets = {}; // 回ったので盤をまっさらに
      apply(j, animate);
    }
    function addBet(k) {
      if (busy || !T) return;
      if (!bets[k] && Object.keys(bets).length >= SL.ROULETTE.maxBets) return flash(`賭けは${SL.ROULETTE.maxBets}か所まで`);
      if (total() + chip > Math.min(T.money, SL.ROULETTE.maxTotal)) return flash(T.money < total() + chip ? 'お金が足りない' : '1回に賭けられるのは1,000万円まで');
      bets[k] = (bets[k] || 0) + chip; paint();
    }
    async function send(list) {
      busy = true; paint();
      const j = await opt.bet(list);
      busy = false;
      if (!j || j.error) { flash((j && j.error) || '通信できませんでした'); paint(); return; }
      if (list.length) prevBets = list;
      apply(j, false);
      $q('.rl-result').innerHTML = list.length ? `✅ 第${j.round}回に賭けました。回るのを待とう` : '賭けを取り消しました';
    }
    // 毎秒カウントダウン。回る時刻を過ぎたら1回だけ結果を取りに行く
    const timer = setInterval(() => {
      if (!T) return;
      tickTimer();
      if (T.nextAt + 2500 - (Date.now() + skew) < 0 && Date.now() - lastFetch > Math.min(60000, 4000 * 2 ** fails)) refresh(true);
    }, 1000);

    bg.addEventListener('click', (e) => {
      const cell = e.target.closest('.rl-cell'); if (cell) return addBet(cell.dataset.k);
      const c = e.target.closest('.rl-chips button'); if (c) { chip = +c.dataset.c; return paint(); }
      const act = e.target.closest('[data-act]'); if (!act) return;
      const a = act.dataset.act;
      if (a === 'clear' && !busy) { bets = {}; paint(); }
      if (a === 'again' && !busy && prevBets) { bets = Object.fromEntries(prevBets.map((b) => [b.k, b.a])); paint(); }
      if (a === 'confirm' && !busy) send(Object.entries(bets).map(([k, v]) => ({ k, a: v })));
      if (a === 'cancel' && !busy) { bets = {}; send([]); }
      if (a === 'close') { clearInterval(timer); bg.remove(); if (opt.onClose) opt.onClose(); }
    });
    await refresh(false);
  };
})();
