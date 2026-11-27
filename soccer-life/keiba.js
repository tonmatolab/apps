// ===== 競馬の画面（一人用・オンライン共通） =====
// openKeiba({ getMoney, run, onClose })   … 一人用。出走表はこの画面で作り、run(card, bets) でその場で走らせる
//   run(card, bets) … { order, results, total, back, net, money } か { error }
// openKeibaTable({ load, bet, onClose }) … オンライン。全員共通のレースが決まった時刻に1回だけ走る
//   load()    … { now, nextAt, round, intervalMin, card, last, hist, players, myBets, myLast, money } か { error }
//   bet(bets) … 次のレースへの馬券を確定する（[] で取り消し）。返り値は load と同じ
// ゲーム内のお金だけを賭ける。着順は core-games.js（オンラインはサーバー）が決める。
'use strict';
(() => {
  const CHIPS = [10, 50, 100, 500, 1000]; // 1レースに賭けられるのは1,000万円まで
  const od = (x) => Number(x).toFixed(1); // オッズはいつも小数1けた（4 → 4.0）
  const fmt = (v) => (v >= 10000 ? `${(v / 10000).toFixed(v % 10000 ? 1 : 0)}億` : `${v.toLocaleString()}万`) + '円';
  // 帽子の色（1白 2黒 3赤 4青 5黄 6緑 7橙 8桃）
  const CAP = ['#f4f4f4', '#222', '#e0362c', '#2f6fe0', '#f2d22e', '#2aa65a', '#f08a24', '#f19bc0'];
  const CAP_INK = ['#222', '#fff', '#fff', '#fff', '#222', '#fff', '#fff', '#222'];
  const cap = (no) => `<span class="kb-cap" style="background:${CAP[no - 1]};color:${CAP_INK[no - 1]}">${no}</span>`;
  const TYPES = { w: '単勝', p: '複勝', q: '馬連' };
  const TYPE_NOTE = { w: '1着を当てる', p: '3着までに入る馬を当てる', q: '1着と2着の2頭を当てる（順番はどちらでも）。2頭をタップ' };

  // 走る順番の動き：脚質で前半・後半の速さを変える（逃げは前半速く、追込は最後に伸びる）。全頭が着順どおりの時刻にゴールする
  const EXP = { 逃げ: .78, 先行: .9, 差し: 1.12, 追込: 1.3 };

  function sheetHTML(online) {
    return `<div class="sheet casino keiba">
      <div class="rl-head"><b>🏇 ${online ? 'みんなの競馬' : '競馬'}</b><span class="rl-money"></span></div>
      ${online ? '<div class="rl-timer"></div>' : ''}
      <div class="kb-title"></div>
      <div class="kb-track"></div>
      <div class="rl-result">${online ? '読み込み中…' : '馬券を買ってから「スタート」'}</div>
      <div class="kb-hist"></div>
      ${online ? '<div class="rl-winners"></div>' : ''}
      <div class="rl-chips">${CHIPS.map((c) => `<button data-c="${c}">${fmt(c).replace('円', '')}</button>`).join('')}</div>
      <div class="kb-types">${Object.entries(TYPES).map(([k, n]) => `<button data-t="${k}">${n}</button>`).join('')}</div>
      <p class="sub kb-note"></p>
      <div class="kb-card"></div>
      <div class="kb-bets"></div>
      <div class="rl-sum"></div>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="clear">クリア</button><button class="btn" data-act="again">前回と同じ</button></div>
      ${online ? `<button class="btn gold" data-act="confirm" style="margin-top:10px">この馬券で確定</button><button class="btn ghost" data-act="cancel">馬券を取り消す</button>`
        : `<button class="btn gold" data-act="run" style="margin-top:10px">スタート！</button><button class="btn" data-act="newcard" style="margin-top:6px">次のレースへ（出走表を変える）</button>`}
      <p class="sub" style="text-align:center;margin:8px 0 0">${online ? 'レースは全員共通で、決まった時刻に1回だけ走ります。お金が動くのは走った瞬間（それまでは何度でも買い直せる）<br>' : ''}オッズは買ったときのまま（固定）。払い戻しは 賭け金×オッズ。馬もレースもすべて架空です<br>※ゲーム内のお金だけを使います</p>
      <button class="btn ghost" data-act="close">競馬場を出る</button></div>`;
  }

  // 共通の部品：出走表・馬券・レースの動き
  function makeView(bg, st) {
    const $q = (s) => bg.querySelector(s);
    const total = () => Object.values(st.bets).reduce((a, b) => a + b, 0);
    function flash(t) { const el = $q('.rl-result'); el.textContent = t; el.className = 'rl-result warn'; }
    function betName(k) { const info = SL.keibaBetInfo(st.card, k); return info ? info.name : k; }
    function paintCard() {
      const c = st.card;
      if (!c) { $q('.kb-title').textContent = ''; $q('.kb-card').innerHTML = ''; return; }
      $q('.kb-title').innerHTML = `<b>第${c.round}レース ${esc(c.name)}</b> <span class="sub">${esc(c.course)}・${c.horses.length}頭</span>`;
      const T = st.type;
      $q('.kb-card').innerHTML = `<table class="kb-tbl"><tr><th>馬</th><th></th><th>人気</th><th>${TYPES[T === 'q' ? 'w' : T]}</th></tr>${c.horses.map((h) => {
        const k = T === 'q' ? null : T + h.no, v = k ? st.bets[k] : 0, picked = st.pick === h.no;
        return `<tr class="kb-row${v ? ' bet' : ''}${picked ? ' pick' : ''}" data-no="${h.no}"><td>${cap(h.no)}</td><td class="nm">${esc(h.name)}<small>${esc(h.style)}</small></td><td class="pop">${h.pop}</td><td class="od">${od(T === 'p' ? h.place : h.win)}${v ? `<i>${fmt(v).replace('円', '')}</i>` : ''}</td></tr>`;
      }).join('')}</table>${T === 'q' ? `<p class="sub" style="margin:6px 0 0;text-align:center">${st.pick ? `${st.pick}番を選択中。もう1頭をタップ` : '1頭目をタップ'}</p>` : ''}`;
    }
    function paintBets() {
      const ks = Object.keys(st.bets);
      $q('.kb-bets').innerHTML = ks.length ? ks.map((k) => {
        const info = SL.keibaBetInfo(st.card, k);
        return `<div class="kb-bet"><span>${esc(betName(k))}<small>（${info ? od(info.odds) : '-'}倍）</small></span><b>${fmt(st.bets[k])}</b><button data-del="${k}" aria-label="取り消す">×</button></div>`;
      }).join('') : '';
    }
    function paintCommon(money) {
      $q('.rl-money').innerHTML = `所持金 <b>${fmt(money)}</b>`;
      bg.querySelectorAll('.rl-chips button').forEach((b) => b.classList.toggle('on', +b.dataset.c === st.chip));
      bg.querySelectorAll('.kb-types button').forEach((b) => b.classList.toggle('on', b.dataset.t === st.type));
      $q('.kb-note').textContent = TYPE_NOTE[st.type];
      paintCard(); paintBets();
    }
    function addBet(k, money) {
      if (st.busy || !st.card) return;
      if (!st.bets[k] && Object.keys(st.bets).length >= SL.KEIBA.maxBets) return flash(`馬券は${SL.KEIBA.maxBets}点まで`);
      if (total() + st.chip > Math.min(money, SL.KEIBA.maxTotal)) return flash(money < total() + st.chip ? 'お金が足りない' : '1レースに賭けられるのは1,000万円まで');
      st.bets[k] = (st.bets[k] || 0) + st.chip;
      return true;
    }
    // 馬の列をタップ：単勝・複勝はそのまま、馬連は2頭目で1点
    function tapHorse(no, money) {
      if (st.type !== 'q') return addBet(st.type + no, money);
      if (!st.pick || st.pick === no) { st.pick = st.pick === no ? null : no; return true; }
      const a = Math.min(st.pick, no), b = Math.max(st.pick, no); st.pick = null;
      return addBet(`q${a}-${b}`, money);
    }
    // レースの動き。order：着順（馬番）。done() はゴールのあと
    function runAnim(order, done) {
      const c = st.card, track = $q('.kb-track');
      track.innerHTML = c.horses.map((h) => `<div class="kb-lane"><span class="kb-no">${cap(h.no)}</span><div class="kb-run"><span class="kb-horse" data-no="${h.no}">🏇</span></div></div>`).join('') + '<div class="kb-goal"></div>';
      const rank = Object.fromEntries(order.map((no, i) => [no, i]));
      const D = 6200, T = c.horses.map((h) => D * (1 + rank[h.no] * .035 + Math.random() * .012)), t0 = performance.now();
      const els = [...track.querySelectorAll('.kb-horse')], wob = c.horses.map(() => Math.random() * 6);
      const step = (now) => {
        const t = now - t0;
        c.horses.forEach((h, i) => {
          const u = Math.min(1, t / T[i]), e = EXP[h.style] || 1;
          const x = Math.pow(u, e) * 100 + (u < 1 ? Math.sin(t / 260 + wob[i]) * .8 : 0);
          els[i].style.left = `calc(${Math.max(0, Math.min(100, x))}% - ${Math.max(0, Math.min(100, x)) * .26}px)`;
        });
        if (t < Math.max(...T) + 300) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    }
    function trackIdle() {
      const c = st.card, track = $q('.kb-track');
      if (!c) { track.innerHTML = ''; return; }
      track.innerHTML = c.horses.map((h) => `<div class="kb-lane"><span class="kb-no">${cap(h.no)}</span><div class="kb-run"><span class="kb-horse" style="left:0">🏇</span></div></div>`).join('') + '<div class="kb-goal"></div>';
    }
    const orderText = (order, card) => order.slice(0, 3).map((no, i) => `${i + 1}着 ${cap(no)}${esc(card.horses[no - 1].name)}`).join('<br>');
    const resultLine = (r) => `${r.net > 0 ? `🎉 +${fmt(r.net)}` : r.net < 0 ? `−${fmt(-r.net)}` : '±0'}${(r.results || []).some((x) => x.win) ? `<br><small>的中：${r.results.filter((x) => x.win).map((x) => `${esc(x.name)}（${fmt(x.payout)}）`).join('・')}</small>` : ''}`;
    return { $q, total, flash, paintCommon, tapHorse, runAnim, trackIdle, orderText, resultLine };
  }

  // ===== 一人用 =====
  window.openKeiba = function openKeiba(opt) {
    const st = { card: SL.newKeibaCard(1), bets: {}, chip: 100, type: 'w', pick: null, busy: false, round: 1, prev: null, hist: [] };
    const bg = document.createElement('div'); bg.className = 'ov-bg';
    bg.innerHTML = sheetHTML(false);
    document.body.appendChild(bg);
    const V = makeView(bg, st), $q = V.$q;
    function paint() {
      V.paintCommon(opt.getMoney());
      const t = V.total();
      $q('.rl-sum').innerHTML = t ? `合計 <b>${fmt(t)}</b>（${Object.keys(st.bets).length}点）` : '<span class="sub">チップを選んで、馬をタップ</span>';
      $q('[data-act="run"]').disabled = st.busy || !t;
      $q('[data-act="again"]').disabled = st.busy || !st.prev;
      $q('[data-act="newcard"]').disabled = st.busy;
      $q('.kb-hist').innerHTML = st.hist.map((h) => `<span class="kb-h">${cap(h.no)}${od(h.odds)}倍</span>`).join('');
    }
    function newCard() { st.round++; st.card = SL.newKeibaCard(st.round); st.bets = {}; st.pick = null; V.trackIdle(); $q('.rl-result').className = 'rl-result'; $q('.rl-result').textContent = '馬券を買ってから「スタート」'; paint(); }
    async function run() {
      const list = Object.entries(st.bets).map(([k, a]) => ({ k, a }));
      st.busy = true; paint();
      const r = await opt.run(st.card, list);
      if (!r || r.error) { st.busy = false; V.flash((r && r.error) || 'エラー'); paint(); return; }
      st.prev = list;
      $q('.rl-result').className = 'rl-result'; $q('.rl-result').textContent = '各馬いっせいにスタート！';
      V.runAnim(r.order, () => {
        const win = st.card.horses[r.order[0] - 1];
        st.hist.unshift({ no: win.no, odds: win.win }); if (st.hist.length > 10) st.hist.length = 10;
        $q('.rl-result').className = `rl-result ${r.net > 0 ? 'win' : r.net < 0 ? 'lose' : ''}`;
        $q('.rl-result').innerHTML = `${V.orderText(r.order, st.card)}<br>${V.resultLine(r)}`;
        st.busy = false; st.bets = {}; paint();
        $q('[data-act="run"]').textContent = 'もう一度（同じ出走表）';
      });
    }
    bg.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]'); if (del && !st.busy) { delete st.bets[del.dataset.del]; return paint(); }
      const row = e.target.closest('.kb-row'); if (row) { if (V.tapHorse(+row.dataset.no, opt.getMoney())) paint(); return; }
      const c = e.target.closest('.rl-chips button'); if (c) { st.chip = +c.dataset.c; return paint(); }
      const tp = e.target.closest('.kb-types button'); if (tp) { st.type = tp.dataset.t; st.pick = null; return paint(); }
      const act = e.target.closest('[data-act]'); if (!act) return;
      const a = act.dataset.act;
      if (a === 'clear' && !st.busy) { st.bets = {}; st.pick = null; paint(); }
      if (a === 'again' && !st.busy && st.prev) { st.bets = {}; for (const b of st.prev) if (SL.keibaBetInfo(st.card, b.k)) st.bets[b.k] = b.a; paint(); }
      if (a === 'run' && !st.busy) run();
      if (a === 'newcard' && !st.busy) newCard();
      if (a === 'close' && !st.busy) { bg.remove(); if (opt.onClose) opt.onClose(); }
    });
    V.trackIdle(); paint();
  };

  // ===== オンライン（全員共通のレース） =====
  window.openKeibaTable = async function openKeibaTable(opt) {
    const st = { card: null, bets: {}, chip: 100, type: 'w', pick: null, busy: false, prev: null };
    let T = null, skew = 0, shown = 0, fetching = false, lastTry = 0, fails = 0;
    const bg = document.createElement('div'); bg.className = 'ov-bg';
    bg.innerHTML = sheetHTML(true);
    document.body.appendChild(bg);
    const V = makeView(bg, st), $q = V.$q;
    const confirmed = () => T && JSON.stringify(Object.fromEntries(T.myBets.map((b) => [b.k, b.a]))) === JSON.stringify(st.bets);
    function lastText() {
      const L = T.last, my = T.myLast;
      if (!L) return '<span class="sub">まだ1回も走っていません</span>';
      let mine = '<small>このレースは買っていません</small>';
      if (my && my.round === L.round) mine = my.void ? `<small>馬券は無効になりました（${esc(my.void)}）</small>` : V.resultLine(my);
      return `<small>第${L.round}レース ${esc(L.name)}</small><br>${V.orderText(L.order, L)}<br>${mine}`;
    }
    function paint() {
      if (!T) return;
      V.paintCommon(T.money);
      const my = T.myLast && T.last && T.myLast.round === T.last.round ? T.myLast.net : 0;
      if (!st.busy) $q('.rl-result').className = `rl-result ${my > 0 ? 'win' : my < 0 ? 'lose' : ''}`;
      $q('.kb-hist').innerHTML = (T.hist || []).map((h) => `<span class="kb-h">${cap(h.no)}${od(h.odds)}倍</span>`).join('');
      const W = (T.last && T.last.winners) || [];
      $q('.rl-winners').innerHTML = W.length ? `<div class="sub" style="text-align:center">第${T.last.round}レースの大当たり：${W.map((x) => `${esc(x.name)} +${fmt(x.net)}`).join('・')}</div>` : '';
      const t = V.total(), ok = confirmed();
      $q('.rl-sum').innerHTML = t ? `第${T.round}レースへ 合計 <b>${fmt(t)}</b>（${Object.keys(st.bets).length}点）　${ok ? '<span style="color:#7be3a5">✅ 確定済み</span>' : '<span style="color:#ffb37a">まだ確定していません</span>'}`
        : T.myBets.length ? '<span style="color:#ffb37a">馬券を取り消すには「馬券を取り消す」</span>' : '<span class="sub">チップを選んで、馬をタップ → 「この馬券で確定」</span>';
      $q('[data-act="confirm"]').disabled = st.busy || !t || ok;
      $q('[data-act="cancel"]').style.display = T.myBets.length ? '' : 'none';
      $q('[data-act="again"]').disabled = st.busy || !st.prev;
      tickTimer();
    }
    function tickTimer() {
      if (!T) return;
      const left = T.nextAt - (Date.now() + skew), s = Math.max(0, Math.ceil(left / 1000));
      $q('.rl-timer').innerHTML = left > 0 ? `第${T.round}レースまで <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>・${T.players}人が買っています` : `第${T.round}レース、走っています…`;
    }
    function apply(j, animate) {
      const newRace = j.last && j.last.round > shown;
      const lastCard = j.last ? { ...j.last, horses: j.last.horses } : null;
      T = j; skew = j.now - Date.now();
      if (!st.prev && j.myLast && j.myLast.results) st.prev = j.myLast.results.map((x) => ({ k: x.k, a: x.a }));
      if (newRace && animate && lastCard) {
        shown = j.last.round;
        st.card = lastCard; st.busy = true; // 走ったレースを見せてから、次の出走表へ
        $q('.rl-result').className = 'rl-result'; $q('.rl-result').textContent = '各馬いっせいにスタート！';
        V.runAnim(j.last.order, () => { st.busy = false; st.card = j.card; $q('.rl-result').innerHTML = lastText(); V.trackIdle(); paint(); });
        paint(); return;
      }
      if (newRace) shown = j.last.round;
      st.card = j.card;
      st.bets = j.myBets.length ? Object.fromEntries(j.myBets.map((b) => [b.k, b.a])) : (newRace ? {} : st.bets);
      $q('.rl-result').innerHTML = lastText();
      V.trackIdle(); paint();
    }
    async function refresh(animate) {
      if (fetching) return; fetching = true; lastTry = Date.now(); // 失敗しても、すぐにはやり直さない
      const j = await opt.load();
      fetching = false;
      if (!j || j.error) { fails++; V.flash((j && j.error) || '通信できませんでした'); return; }
      fails = 0;
      if (animate && j.last && j.last.round > shown && !j.myBets.length) st.bets = {};
      apply(j, animate);
    }
    async function send(list) {
      st.busy = true; paint();
      const j = await opt.bet(list);
      st.busy = false;
      if (!j || j.error) { V.flash((j && j.error) || '通信できませんでした'); paint(); return; }
      if (list.length) st.prev = list;
      apply(j, false);
      $q('.rl-result').innerHTML = list.length ? `✅ 第${j.round}レースの馬券を買いました。発走を待とう` : '馬券を取り消しました';
    }
    // 毎秒カウントダウン。発走の時刻を過ぎたら結果を取りに行く（失敗したら 5秒→10秒→…最大60秒あける）
    const timer = setInterval(() => {
      if (!T) return;
      tickTimer();
      const wait = Math.min(60000, 5000 * 2 ** fails);
      if (T.nextAt + 2500 - (Date.now() + skew) < 0 && Date.now() - lastTry > wait) refresh(true);
    }, 1000);
    bg.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]'); if (del && !st.busy) { delete st.bets[del.dataset.del]; return paint(); }
      const row = e.target.closest('.kb-row'); if (row && T && !st.busy) { if (V.tapHorse(+row.dataset.no, T.money)) paint(); return; }
      const c = e.target.closest('.rl-chips button'); if (c) { st.chip = +c.dataset.c; return paint(); }
      const tp = e.target.closest('.kb-types button'); if (tp) { st.type = tp.dataset.t; st.pick = null; return paint(); }
      const act = e.target.closest('[data-act]'); if (!act) return;
      const a = act.dataset.act;
      if (a === 'clear' && !st.busy) { st.bets = {}; st.pick = null; paint(); }
      if (a === 'again' && !st.busy && st.prev && st.card) { st.bets = {}; for (const b of st.prev) if (SL.keibaBetInfo(st.card, b.k)) st.bets[b.k] = b.a; paint(); }
      if (a === 'confirm' && !st.busy) send(Object.entries(st.bets).map(([k, v]) => ({ k, a: v })));
      if (a === 'cancel' && !st.busy) { st.bets = {}; send([]); }
      if (a === 'close') { clearInterval(timer); bg.remove(); if (opt.onClose) opt.onClose(); }
    });
    await refresh(false);
  };
})();
