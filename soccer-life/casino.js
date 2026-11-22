// ===== カジノ：ルーレットの画面（一人用・オンライン共通） =====
// openRoulette({ getMoney, spinsLeft, spin, onClose })
//   getMoney()   … 今の所持金（万円）
//   spinsLeft()  … あと何回回せるか（制限なしなら null）
//   spin(bets)   … 1回まわす。{ num, color, results, total, back, net, money } か { error } を返す（Promise でもよい）
//   onClose()    … 閉じたあとに呼ぶ
// ゲーム内のお金だけを賭ける。当たり外れは core.js の spinRoulette（オンラインはサーバー）が決める。
'use strict';
(() => {
  const CHIPS = [10, 50, 100, 500, 1000, 5000];
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
      if (total() + chip > Math.min(opt.getMoney(), SL.ROULETTE.maxTotal)) return flash(opt.getMoney() < total() + chip ? 'お金が足りない' : '1回に賭けられるのは1億円まで');
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
})();
