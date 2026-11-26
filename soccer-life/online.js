// ===== サッカー人生 オンラインリーグ（画面側） =====
// 一人用（index.html の本体スクリプト）と名前がぶつからないよう、全体を1つの関数の中に閉じ込めている。
// 画面の切り替え showScreen()、esc()・toast()・crest()・avatar()・man() などの見た目の部品は一人用のものを共有する。
'use strict';
(() => {
  const $ = (id) => document.getElementById('ol-' + id); // オンラインの部品はすべて ol- で始まるID
  const store = {
    get(k) { try { return localStorage.getItem('soccerol-' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('soccerol-' + k, v); } catch {} },
    del(k) { try { localStorage.removeItem('soccerol-' + k); } catch {} },
  };
  // 開発中（localhost）は手元の wrangler dev、それ以外は本番のAPI
  const API = new URLSearchParams(location.search).get('api')
    || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787/api' : 'https://tonmatolab-soccer.tonmatolab.workers.dev/api');
  let CODE = store.get('code');
  let ST = null;      // サーバーから受け取った状態
  let skew = 0;       // サーバー時計とのずれ
  let fetchedAt = 0;

  // サーバーとのやりとり。ブラウザが「事前確認」のリクエストを先に送らない形（ヘッダーなし・本文は text/plain の JSON）で送る。
  // 引き継ぎコードは本文の auth に入れる。読むだけのもの（GET）でも、コードがあれば POST にして _m: 'GET' を付ける
  // みんな共通の情報（概要・ランキング）は30秒使い回す（何かを送ったら捨てる）
  const MEMO = {};
  async function api(path, body) {
    const shared = !body && /^\/(public|rankings|ranking)(\?|$)/.test(path), key = path + '|' + (CODE || '');
    if (shared && MEMO[key] && Date.now() - MEMO[key].t < 30000) return MEMO[key].j;
    if (body) for (const k in MEMO) delete MEMO[k];
    try {
      const opt = { method: 'GET', signal: AbortSignal.timeout(10000) };
      if (body || CODE) { opt.method = 'POST'; opt.body = JSON.stringify({ ...(body || { _m: 'GET' }), ...(CODE ? { auth: CODE } : {}) }); }
      const r = await fetch(API + path, opt);
      const j = await r.json().catch(() => null);
      if (r.ok && shared) MEMO[key] = { t: Date.now(), j };
      return r.ok ? j : { error: (j && j.error) || 'http_' + r.status };
    } catch { return { error: 'network' }; }
  }
  const ERR = { pos_full: 'そのポジションは満員です。ほかのポジションを選んでください', bad_move: 'その名前は使えません', already: 'もう移籍を希望しています', pk_ended: 'PKチャレンジは終わりました。PKは試合の中で起きます', bad_kick: '蹴り方がおかしい', club_full: 'そのクラブは満員です（国内は1クラブ14人・欧州は12人・GKは3人・FWは4人まで）', 'お金が足りない': 'お金が足りません', network: '通信できませんでした', bad_name: 'その名前は使えません', too_many: '登録が多すぎます。しばらく待ってください', too_many_today: '同じ回線からの登録は1日3人までです。明日またどうぞ（前に作ったアカウントは、引き継ぎコードで続けられます）', name_crowded: 'その名前の選手はもう2人います。ほかの名前にしてください', full: 'オンラインリーグは定員に達しています。空きが出るまでお待ちください（3日来ていない人は休眠になり、枠が空きます）', unauthorized: 'コードが正しくありません', not_now: '今はできません', must_retire: '引退するしかありません', too_young: '30歳から引退できます', no_contract: '契約が切れています。オファーを選んでください', bad_choice: '選べません' };
  const errMsg = (e) => ERR[e] || 'エラー：' + e;
  function show(id) { showScreen('ol-' + id); if (location.hash !== '#online') history.replaceState(null, '', '#online'); }

  // ----- 見た目の部品（オンラインだけのもの） -----
  const club = (id) => ST.clubs[id];
  const startChanceTxt = (ovr, c, age) => SL.chanceLabel(SL.startChanceOvr(ovr, c, age));
  function offerCard(o, i, badge = '') {
    const c = club(o.club), L = SL.LEAGUES[c.lg], pc = startChanceTxt(ST.me.ovr, c, ST.me.age);
    const full = !o.stay && c.humans >= c.cap;
    return `<button class="offer" data-i="${i}"${full ? ' disabled style="opacity:.55"' : ''}>${crest(c)}<div class="bd"><div class="nm">${badge}${esc(c.name)}<span class="hum">👤${c.humans}/${c.cap}</span>${full ? ' <span class="full">満員</span>' : ''}</div>
      <div class="mt"><b>${L.name}</b>｜チーム力 <b class="num">${c.str}</b><br>年俸 <b>${man(o.salary)}</b>${o.capped ? '（上限）' : ''}・${o.years}年契約${o.trial ? '（テスト入団）' : ''}${o.fee ? `<br>移籍金 <b>${man(o.fee)}</b>` : ''}</div></div><div class="pt"><b>${pc[0]}</b>${pc[1]}</div></button>`;
  }
  // オフが終わる（開幕する）時刻の言い方
  const offUntil = (w) => w.endAt ? new Date(w.endAt - skew).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : `約${w.offLeft * w.tickMin}分後`;
  function countdown() {
    if (!ST) return '';
    const off = ST.world.phase !== 'season';
    const left = (off && ST.world.endAt ? ST.world.endAt : ST.world.nextAt) - (Date.now() + skew); // オフは「開幕まで」
    if (left <= 0) return '集計中…';
    const h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
    return `${off ? '開幕まで' : '次の節'} ${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
  }

  // ===== はじめに =====
  function newsHTML(list) {
    return list.map((x) => `<li>${esc(x.t)}<time>${new Date(x.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</time></li>`).join('');
  }
  async function renderStart() {
    show('scrStart');
    const j = await api('/public');
    if (j.error) { $('startWorld').innerHTML = `<div style="grid-column:1/-1">${errMsg(j.error)}</div>`; $('startScorers').innerHTML = '<li class="empty">-</li>'; return; }
    const w = j.world; skew = w.now - Date.now(); POSI = j.positions || null;
    const full = !!POSI && Object.values(POSI).every((p) => !p.open);
    $('fullBox').classList.toggle('hidden', !full);
    $('startBtn').textContent = full ? '🈵 いまは満員です（新しい選手は登録できません）' : '⚽ 選手になる（無料・メール不要）';
    $('startBtn').disabled = full;
    $('tickTxt').textContent = w.tickMin >= 60 ? `${w.tickMin / 60}時間` : `${w.tickMin}分`;
    $('startWorld').innerHTML = `<div>シーズン<b>${w.year}年</b></div><div>${w.phase === 'season' ? '節' : 'オフ'}<b>${w.phase === 'season' ? `${w.week}/${w.weeks}` : `残り${w.offLeft}`}</b></div><div>プレイヤー<b>${w.players}人</b></div>`;
    $('startNewsCard').classList.toggle('hidden', !(j.news && j.news.length));
    if (j.news) $('startNews').innerHTML = newsHTML(j.news);
    $('startScorers').innerHTML = j.scorers.length ? j.scorers.map((r, i) => `<li><span class="no">${i + 1}</span><span class="nm">${esc(r.name)} <span class="sub">${esc(r.club)}</span></span><span class="v">${r.v}</span></li>`).join('') : '<li class="empty">まだゴールを決めたプレイヤーはいません</li>';
  }

  // ===== 作成 =====
  let selPos = 'FW', selAppeal = null, POSI = null;
  // ポジションのボタンに混み具合を出す。満員のポジションは選べない（選んでいたら空いているポジションに移す）
  const POS_LABEL = { 満員: '🚫 満員', 激戦: '🔥 激戦', ふつう: '🙂 ふつう', 狙い目: '🎯 狙い目' };
  function paintPositions(pickAp) {
    if (!POSI) return;
    const btns = [...$('poses').querySelectorAll('.pos')];
    for (const b of btns) {
      const P = POSI[b.dataset.p]; if (!P) continue;
      b.disabled = !P.open; b.classList.toggle('full', !P.open);
      b.querySelector('.crowd')?.remove();
      b.insertAdjacentHTML('beforeend', `<em class="crowd c-${P.label}">${POS_LABEL[P.label]}${P.open ? `・空き${P.open}` : ''}${P.bonus ? `・才能+${P.bonus}` : ''}</em>`);
    }
    if (POSI[selPos] && !POSI[selPos].open) {
      const ok = btns.find((b) => !b.disabled);
      if (ok) { selPos = ok.dataset.p; btns.forEach((x) => x.classList.toggle('on', x === ok)); pickAp(); }
    }
    const allFull = btns.every((b) => b.disabled);
    $('signupMsg').textContent = allFull ? 'いまはどのポジションも満員です。空きが出るまでお待ちください' : '';
    $('signupBtn').disabled = allFull;
    $('soloBtn2').classList.toggle('hidden', !allFull);
  }
  function renderCreate(next = false) {
    $('createTitle').textContent = next ? '子どもの名前は？' : 'あなたの名前は？';
    $('signupBtn').textContent = next ? '次の世代を始める ▶' : 'プロになる ▶';
    $('signupBtn').dataset.next = next ? '1' : '';
    if (next) { const sur = String(ST.me.name).split(/[\s　]+/); $('nameIn').value = sur.length > 1 ? sur[0] + ' ' : ''; }
    $('poses').innerHTML = Object.entries(SL.POS).map(([k, v]) => `<button class="pos${k === selPos ? ' on' : ''}" data-p="${k}"><b>${posTag(k)}${v.name}</b><span>${v.desc}</span></button>`).join('');
    const pickAp = () => appealPicker($('appeals'), selPos, selAppeal, (k) => { selAppeal = k; });
    $('poses').querySelectorAll('.pos').forEach((b) => b.onclick = () => { selPos = b.dataset.p; $('poses').querySelectorAll('.pos').forEach((x) => x.classList.toggle('on', x === b)); pickAp(); });
    pickAp();
    $('signupMsg').textContent = ''; $('signupBtn').disabled = false;
    paintPositions(pickAp);
    api('/public').then((j) => { if (j && j.positions) { POSI = j.positions; paintPositions(pickAp); } }); // 最新の空きに更新
    show('scrCreate');
  }
  async function signup() {
    const name = $('nameIn').value.trim(); if (!name) { $('signupMsg').textContent = '名前を入れてください'; return; }
    $('signupBtn').disabled = true;
    if ($('signupBtn').dataset.next) {
      const j = await api('/nextgen', { name, pos: selPos, appeal: selAppeal });
      $('signupBtn').disabled = false;
      if (j.error) { $('signupMsg').textContent = errMsg(j.error); return; }
      setState(j); return route();
    }
    const j = await api('/signup', { name, pos: selPos, appeal: selAppeal });
    $('signupBtn').disabled = false;
    if (j.error) { $('signupMsg').textContent = errMsg(j.error); return; }
    CODE = j.code; store.set('code', CODE); setState(j.state);
    // アプリ一覧の「遊んだ人数」（全アプリ共通のカウンター）
    try { if (!localStorage.getItem('soccer-played')) { localStorage.setItem('soccer-played', '1'); fetch('https://tonmatolab-counter.tonmatolab.workers.dev/hit/soccer-play', { method: 'POST' }).catch(() => {}); } } catch {}
    $('codeShow').textContent = CODE;
    show('scrCode');
  }
  let seenRl = null;
  function setState(j) {
    ST = j; skew = j.world.now - Date.now(); fetchedAt = Date.now();
    const my = j.casino && j.casino.myLast;
    if (seenRl !== null && my && my.round > seenRl) {
      const col = { red: '赤', black: '黒', green: '緑' }[SL.rlColor(my.num)];
      toast(my.void ? `🎰 第${my.round}回：お金が足りず賭けは無効` : `🎰 第${my.round}回は${my.num}（${col}）：${my.net > 0 ? '+' : my.net < 0 ? '−' : '±'}${man(Math.abs(my.net))}`);
    }
    if (my) seenRl = Math.max(seenRl || 0, my.round); else if (seenRl === null) seenRl = 0;
  }

  // ===== 入団 =====
  const POLICY = {
    auto: { name: 'おまかせ', icon: '🤖', desc: '出番・強さ・年俸のバランスで選ぶ' },
    minutes: { name: '出番重視', icon: '⚽', desc: '先発で出られるクラブを選ぶ' },
    money: { name: '年俸重視', icon: '💰', desc: 'いちばん年俸の高いクラブを選ぶ' },
    top: { name: '上を目指す', icon: '🏆', desc: '強いクラブ・上のリーグを選ぶ' },
    stay: { name: '残留優先', icon: '🏠', desc: 'できるだけ今のクラブに残る' },
  };
  const MOVE_SWITCH = { bench: '控えのときだけ', always: 'する', never: 'しない' };
  const policyText = (me) => `${POLICY[me.policy].icon} ${POLICY[me.policy].name}${me.policy === 'stay' ? '' : `・契約中も移る：${MOVE_SWITCH[me.sw]}`}`;
  function openPolicy() {
    const html = () => `<h3 style="margin:0 0 4px">🔁 移籍方針</h3>
      <p class="sub" style="margin:0 0 8px">オフ（毎日 2〜5時・14〜17時）に契約を選ばなかったとき、この方針で自動で決まります。いつでも変えられます</p>
      <div class="stack">${Object.entries(POLICY).map(([k, p]) => `<button class="btn pol${ST.me.policy === k ? ' primary' : ''}" data-p="${k}" style="text-align:left">${p.icon} ${p.name}<br><span class="sub" style="font-weight:600">${p.desc}</span></button>`).join('')}</div>
      <h3 style="margin:12px 0 4px">契約が残っていても移る？</h3>
      <div class="tabs rk">${Object.entries(MOVE_SWITCH).map(([k, v]) => `<button class="sw${ST.me.sw === k ? ' on' : ''}" data-s="${k}">${v}</button>`).join('')}</div>
      <p class="sub" style="margin:6px 0 0">「控えのときだけ」：今のクラブで先発に入れていないときだけ、方針に合うクラブへ移ります</p>`;
    sheet(`<div id="ol-polBox">${html()}</div>`, [{ label: '閉じる', cls: 'primary' }]);
    const bind = () => {
      const box = document.getElementById('ol-polBox'); if (!box) return;
      const save = async (body) => {
        const j = await api('/policy', body);
        if (j.error) return toast(errMsg(j.error));
        setState(j); box.innerHTML = html(); bind(); route();
      };
      box.querySelectorAll('.pol').forEach((b) => b.onclick = () => save({ policy: b.dataset.p }));
      box.querySelectorAll('.sw').forEach((b) => b.onclick = () => save({ sw: b.dataset.s }));
    };
    setTimeout(bind, 0);
  }
  function renderDraft() {
    // 休眠から戻ってきた人には、ひとこと（能力・経歴・お金はそのまま）
    $('draftList').innerHTML = (ST.me.returning ? '<p style="font-weight:800;margin:0 0 8px">👋 おかえりなさい！ 休眠の間にクラブの枠を空けていました。空いているクラブから選び直してください（能力・経歴・お金はそのまま）</p>' : '') + '<p class="sub" style="margin:0 0 8px">⏰ 1時間以内にクラブを選んでください。選ばないままだと休眠になり、定員の枠を空けます（あとで来れば、また選べます）</p>' + (ST.me.draft && ST.me.draft.length ? ST.me.draft.map((o, i) => offerCard(o, i)).join('') : '<p class="empty">いまは入れるクラブがすべて満員です。席が空いたら、ここにクラブが出ます（しばらくしてから開き直してください）</p>');
    $('draftList').querySelectorAll('.offer').forEach((b) => b.onclick = async () => {
      const j = await api('/join', { i: +b.dataset.i });
      if (j.error) return toast(errMsg(j.error));
      setState(j); toast(`${club(j.me.club).name} に入団！`); route();
    });
    show('scrDraft');
  }

  // ===== ホーム =====
  let tab = 'table';
  function renderHome() {
    const me = ST.me, w = ST.world, c = me.club != null ? club(me.club) : null;
    $('topYear').textContent = `${w.year}年 ${w.phase === 'season' ? `第${Math.min(w.week + 1, w.weeks)}節` : 'オフシーズン'}・${w.players}人`;
    $('topCd').textContent = countdown();
    const color = c ? c.color : '#8a96a0';
    $('pCard').innerHTML = `<div class="band" style="background:${color}"></div>
      <div class="in"><div class="av">${avatar(color, me.number, me.age, me.pos)}</div>
        <div class="who"><div class="nm">${esc(me.name)}</div>
          <div class="cl">${posTag(me.pos)} ${c ? `背番号<b>${me.number}</b>・` : ''}${me.age}歳${me.gen > 1 ? `・${me.gen}代目` : ''}<br>${c ? `<b>${esc(c.name)}</b><br>${SL.LEAGUES[c.lg].name}・年俸 ${man(me.salary)}` : '所属なし'}</div></div>
        <div class="ov"><b style="color:${me.ovr >= 80 ? 'var(--gold)' : 'var(--ink)'}">${me.ovr}</b><span>総合力</span></div></div>
      <div class="meters"><div>調子<b>${['↓', '↘', '→', '↗', '↑'][me.cond + 2]}</b></div><div>疲労<b>${me.fatigue}</b></div><div>人気<b>${me.fame}</b></div><div>${me.injury ? 'ケガ' : '貯金'}<b style="font-size:.78rem">${me.injury ? `🚑 ${me.injury}週` : man(me.money)}</b></div></div>`;
    // 立ち位置と成長の見通し（選手カードの下）
    if (me.club != null && me.policy) {
      $('pCard').insertAdjacentHTML('beforeend', `<div class="standing"><span>🔁 移籍方針：${policyText(me)}</span><button class="btn small" id="ol-polBtn" style="margin-left:auto;padding:2px 10px">変える</button></div>`);
    }
    if (me.depth || me.outlook) $('pCard').insertAdjacentHTML('beforeend', `<div class="standing">${me.depth ? `<span class="${me.depth.starter ? 'st' : ''}">👥 ${esc(me.depth.text)}</span>` : ''}${me.outlook ? `<span>${me.outlook.icon} ${me.outlook.label}（来年 ${me.outlook.nextIcon}${me.outlook.nextLabel}）</span>` : ''}</div>`);
    renderStatus();
    // リーグ速報
    $('newsCard').classList.toggle('hidden', !(ST.news && ST.news.length));
    if (ST.news) $('newsList').innerHTML = newsHTML(ST.news);
    // 今週の最優秀選手
    const mv = ST.motw;
    $('motwCard').classList.toggle('hidden', !mv);
    if (mv) $('motwCard').innerHTML = `<div class="motw"><span class="ic">🏅</span><span>第${mv.week}節の最優秀選手<br><b>${esc(mv.name)}</b> <span class="sub">${esc(club(mv.club).name)}・評価${mv.rating.toFixed(1)}${mv.goals ? `・⚽${mv.goals}` : ''}${mv.assists ? `・👟${mv.assists}` : ''}</span></span>${me.motw ? `<span class="sub" style="margin-left:auto">あなたの受賞 ${me.motw}回</span>` : ''}</div>`;
    // お金の使い道
    const shop = ST.shop || [];
    $('shopCard').classList.toggle('hidden', !shop.length);
    if (shop.length) {
      $('shopMoney').textContent = `貯金 ${man(me.money)}`;
      $('shopList').innerHTML = shop.map((it) => `<button class="shopitem" data-id="${it.id}"${it.ng ? ' disabled' : ''}><i>${it.icon}</i><b>${it.name}</b><span>${it.desc}</span><em>${man(it.price)}${it.ng ? `・${it.ng}` : ''}</em></button>`).join('');
      $('shopList').querySelectorAll('.shopitem').forEach((b) => b.onclick = async () => {
        const r = await api('/buy', { id: b.dataset.id });
        if (r.error) return toast(errMsg(r.error));
        setState(r.state); toast(r.text); renderHome();
      });
    }
    // ルーレットに賭けているとき
    const cz = ST.casino;
    const czLine = cz && cz.myBets.length ? `🎰 第${cz.round}回に${man(cz.myBets.reduce((x, b) => x + b.a, 0))}賭けています（${new Date(cz.nextAt - skew).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}ごろ回ります）` : '';
    $('casinoNote').textContent = czLine;
    $('casinoNote').classList.toggle('hidden', !czLine);
    $('statHead').innerHTML = `📊 能力 <span class="potline">${me.potKnown ? `才能 <b style="color:var(--gold)">${me.potKnown}</b>（見抜いた）` : me.potLo != null ? `才能の見立て ${me.potLo}〜${me.potHi}` : ''}</span>`;
    // 前節
    const L = me.last;
    $('lastCard').classList.toggle('hidden', !L);
    if (L) {
      const us = club(L.club), op = club(L.opp), H = L.home ? us : op, A = L.home ? op : us;
      const res = L.gf > L.gc ? '勝利' : L.gf < L.gc ? '敗戦' : '引き分け';
      const role = { start: `先発（${L.mins}分）`, sub: `途中出場（${L.mins}分）`, bench: 'ベンチで出番なし', injured: 'ケガで欠場' }[L.role];
      $('lastHead').textContent = `📺 第${L.week}節の試合（${res}）`;
      $('lastBody').innerHTML = `<div class="score"><div class="tm">${crest(H)}${esc(H.name)}</div><div class="sc">${L.home ? L.gf : L.gc} - ${L.home ? L.gc : L.gf}</div><div class="tm">${crest(A)}${esc(A.name)}</div></div>
        <div class="me-row"><div class="rating" style="background:${L.rating ? ratingColor(L.rating) : '#b9c3bb'}">${L.rating ? L.rating.toFixed(1) : '-'}</div>
          <div><div class="sub">${role}</div><div style="font-weight:800;font-size:.86rem">${[L.goals ? `⚽ ${L.goals}ゴール` : '', L.assists ? `👟 ${L.assists}アシスト` : '', L.cs ? '🧱 無失点' : '', L.pay ? `💰 試合給 +${L.pay}万円` : ''].filter(Boolean).join('　') || (!L.mins ? '次こそ出番を' : L.rating >= 6.5 ? '堅実なプレーで貢献' : L.rating < 5.5 ? '見せ場を作れず…' : 'まずまずの出来')}</div></div></div>
        ${L.st ? statLineHTML(L.st, me.pos) : ''}${L.log ? matchLogHTML(L.log, us, op, L.ht) : `<ul class="hl">${L.events.map((e) => {
          if (!e.us) return `<li><span class="m">${e.min}'</span><span class="sub">${esc(op.city)}のゴール</span></li>`;
          const mine = e.who === 'me' || e.assist === 'me', mate = !mine && (e.who || e.assist);
          const t = e.who === 'me' ? `あなたの${esc(e.how)}！` : e.who ? `<b>${esc(e.who)}</b>のゴール` : `${esc(us.city)}のゴール`;
          const a = e.assist === 'me' ? '（あなたのアシスト）' : e.assist ? `（${esc(e.assist)}のアシスト）` : '';
          return `<li class="${mine ? 'mine' : mate ? 'mate' : ''}"><span class="m">${e.min}'</span><span>⚽ ${t}${a}</span></li>`;
        }).join('') || '<li class="empty">スコアレス</li>'}</ul>`}${L.note ? `<p class="sub">🚑 ${esc(L.note)}</p>` : ''}`;
    }
    // シーズン
    const S = me.season, rank = c ? ST.tables[c.lg].findIndex((t) => t.id === c.id) + 1 : '-';
    $('seasonHead').innerHTML = `📅 ${w.year}年シーズン`;
    $('seasonBox').innerHTML = `<div>順位<b>${rank}位</b></div><div>出場<b>${S.apps}</b></div><div>${me.pos === 'GK' || me.pos === 'DF' ? '無失点' : 'ゴール'}<b>${me.pos === 'GK' || me.pos === 'DF' ? S.cs : S.goals}</b></div><div>平均評価<b>${S.avg ? S.avg.toFixed(2) : '-'}</b></div>`;
    $('nextTxt').textContent = ST.next ? `次節：${ST.next.home ? 'ホーム' : 'アウェイ'} vs ${club(ST.next.opp).name}` : '';
    // 能力
    const main = SL.mainStats(me.pos);
    $('statList').innerHTML = Object.keys(SL.STATS).filter((k) => k !== 'gk' || me.pos === 'GK').sort((a, b) => main.includes(b) - main.includes(a))
      .map((k) => `<li class="${main.includes(k) ? 'main' : ''}"><span>${SL.STATS[k]}</span><div class="bar"><i style="width:${me.stats[k]}%;${main.includes(k) ? '' : 'background:#9fb3a3'}"></i></div><span class="v">${me.stats[k]}</span></li>`).join('');
    renderTab();
    show('scrHome');
  }

  function renderStatus() {
    const me = ST.me, w = ST.world, el = $('statusPanel');
    if (me.status === 'active') {
      const main = SL.mainStats(me.pos);
      el.innerHTML = `<div class="card"><h2>🏋️ 練習メニュー <span class="sub" style="margin-left:auto">毎節の前に反映</span></h2><div class="trains">${Object.entries(SL.TRAINING).filter(([k, t]) => !t.gkOnly || me.pos === 'GK')
        .map(([k, t]) => `<button class="tr${me.training === k ? ' on' : ''}" data-k="${k}"><i>${t.icon}</i>${t.name}${t.stats && t.stats.length === 1 && main.includes(t.stats[0]) ? '<br><span class="sub" style="font-size:.6rem">得意</span>' : ''}</button>`).join('')}</div>
        <p class="sub" style="margin:8px 0 0">${me.injury ? '🚑 ケガの間はリハビリになります' : SL.TRAINING[me.training].desc || ''}</p></div>`;
      el.querySelectorAll('.tr').forEach((b) => b.onclick = async () => {
        const k = b.dataset.k; const j = await api('/training', { k });
        if (j.error) return toast(errMsg(j.error));
        me.training = k; renderStatus(); toast(`${SL.TRAINING[k].name}にしました`);
      });
    } else if (me.status === 'off') {
      const o = me.offer, c = club(me.club);
      const head = o.forced ? (me.age >= 40 ? '40歳。体が限界を迎えた…' : 'どのクラブからも声がかからなかった…')
        : o.released ? `${esc(c.name)} から戦力外通告…` : o.expiring ? `${esc(c.name)} との契約が切れた。` : `${esc(c.name)} との契約はあと${me.contract}年。`;
      el.innerHTML = `<div class="card panel"><h2>📝 オフシーズン：契約を選ぼう</h2>
        ${o.awards && o.awards.length ? `<ul class="ach" style="margin-bottom:8px">${o.awards.map((a) => `<li>🏅 ${esc(a)}</li>`).join('')}</ul>` : ''}
        ${o.nat ? `<p class="sub" style="margin:0 0 6px">🇯🇵 日本代表に選ばれた（${o.nat}試合）</p>` : ''}
        <p style="font-weight:800;margin:0">${head}</p>${o.notes.map((n) => `<p class="sub" style="margin:2px 0">${esc(n)}</p>`).join('')}
        <div class="stack" style="margin-top:10px" id="ol-offerList">${o.forced ? '' : o.list.map((x, i) => offerCard(x, i, x.stay ? '<span class="badge stay">残留</span>' : SL.isEU(club(x.club).lg) ? '<span class="badge eu">海外</span>' : '<span class="badge">移籍</span>')).join('')}</div>
        <div class="stack" style="margin-top:10px">
          ${!o.forced && !o.expiring && !o.released ? `<button class="btn primary" data-c="stay">${esc(c.city)}に残る（契約あと${me.contract}年）</button>` : ''}
          ${!o.forced && !o.requested ? '<button class="btn" id="ol-requestBtn">📣 移籍を希望する（オファーが増える・人気-1）</button>' : ''}
          ${o.forced || o.canRetire ? `<button class="btn ${o.forced ? 'primary' : 'ghost'}" data-c="retire">👋 引退する</button>` : ''}
        </div>
        <p class="sub" style="margin:8px 0 0">⏰ オフは${offUntil(w)}まで（毎日 2〜5時・14〜17時）。選ばなかった場合は、オフ終了時に移籍方針（${policyText(me)}）で自動で決まります${me.autoPlan ? `<br>👉 このままだと：<b>${me.autoPlan.kind === 'retire' ? '引退' : me.autoPlan.kind === 'move' ? `${esc(club(me.autoPlan.club).name)}へ移籍` : `${esc(c.name)}に残留`}</b>` : ''}</p>
        <button class="btn small" id="ol-polBtn2" style="margin-top:6px">🔁 移籍方針を変える</button></div>`;
      const pick = async (choice) => {
        if (choice === 'retire' && !confirm('本当に引退しますか？')) return;
        const j = await api('/decide', { choice });
        if (j.error) return toast(errMsg(j.error));
        setState(j); renderHome(); toast(choice === 'retire' ? 'おつかれさまでした' : '契約しました！');
      };
      el.querySelectorAll('#ol-offerList .offer').forEach((b) => b.onclick = () => pick(+b.dataset.i));
      el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => pick(b.dataset.c));
      const rq = el.querySelector('#ol-requestBtn');
      if (rq) rq.onclick = async () => { rq.disabled = true; const j = await api('/request', {}); if (j.error) { rq.disabled = false; return toast(errMsg(j.error)); } setState(j); renderHome(); toast('移籍を希望した。オファーが届いた'); };
    } else if (me.status === 'decided') {
      el.innerHTML = `<div class="card"><h2>✅ 契約済み</h2><p style="margin:0;font-weight:700">${esc(club(me.club).name)}で新シーズンを待とう。開幕は${offUntil(w)}。</p><p class="sub" style="margin:6px 0 0">試合は毎日 5〜14時・17〜深夜2時に30分ごと。オフは 2〜5時・14〜17時</p></div>`;
    } else if (me.status === 'retired') {
      const sm = me.summary;
      el.innerHTML = `<div class="card panel" style="text-align:center"><div class="sub" style="font-weight:800">${sm.retireAge}歳で現役引退</div>
        <div style="font-family:var(--head);font-size:1.7rem;color:var(--green);margin:6px 0 2px">${esc(sm.title)}</div><div class="sub">${esc(sm.titleDesc)}</div>
        <div style="margin-top:8px;font-family:var(--num);font-weight:800"><span style="font-size:2.6rem;color:var(--gold)">${sm.letter}</span> ${sm.score.toLocaleString()}pt</div>
        ${typeof topTitleHTML === 'function' ? topTitleHTML(sm) : ''}
        <div class="bigstat"><div>シーズン<b>${sm.years}</b></div><div>出場<b>${sm.apps}</b></div><div>ゴール<b>${sm.goals}</b></div><div>代表<b>${sm.caps}</b></div></div>
        <div class="stack" style="margin-top:12px">${typeof shareCareer === 'function' ? `<button class="btn x" id="ol-shareBtn">𝕏 で引退を報告${(() => { const t = SL.titleInfo(SL.topTitle(sm.titles)); return t && t.rarity.rank >= 2 ? `（【${t.rarity.id}】の画像つき）` : ''; })()}</button>` : ''}
        <button class="btn primary" id="ol-nextGenBtn">👶 次の世代へ（${me.gen + 1}代目）</button></div></div>`;
      $('nextGenBtn').onclick = () => renderCreate(true);
      if ($('shareBtn')) { $('shareBtn').onclick = () => shareCareer(sm, '【オンライン】'); prepShareImage(sm); }
      try {
        const done = JSON.parse(store.get('colIds') || '[]');
        if (sm.titles && !done.includes(me.id) && typeof loadCol === 'function') {
          const r = SL.addToCollection(loadCol(), sm, 'online');
          saveCol(r.col); done.push(me.id); store.set('colIds', JSON.stringify(done));
          if (r.newTitles.length) toast(`称号を${r.newTitles.length}個手に入れた！（図鑑に記録）`);
          if (typeof celebrateTopTitle === 'function') celebrateTopTitle(sm); // 激レア以上なら演出（初めて引退画面を開いたとき）
        }
      } catch {}
      const ts = SL.byRarity ? SL.byRarity(sm.titles || []).map((id) => SL.titleInfo(id)).filter(Boolean) : (sm.titles || []).map((id) => SL.titleInfo(id)).filter(Boolean);
      if (ts.length) el.insertAdjacentHTML('beforeend', `<div class="card"><h2>🎖️ 手に入れた称号 <span class="sub" style="margin-left:auto">${ts.length}個</span></h2><div class="tgrid">${typeof titleCardsHTML === 'function' ? titleCardsHTML(sm.titles || []) : ts.map((t) => `<div class="tcard"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></div>`).join('')}</div></div>`);
    }
  }

  // カップ戦の結果（全体）
  function cupResultsHTML() {
    const cup = ST.cup; if (!cup) return '';
    const me = ST.me.club, lc = ST.me.lastCup;
    const rounds = cup.results.map((r) => `<div class="sub" style="margin:8px 0 2px;font-weight:800">${r.round}</div><ul class="list">${r.res.map((x) => {
      const a = club(x.h), b = club(x.a), mine = x.h === me || x.a === me;
      return `<li style="${mine ? 'background:var(--chip);' : ''}"><span style="flex:1">${x.win === x.h ? '<b>' : ''}${esc(a.city)}${x.win === x.h ? '</b>' : ''}</span><span class="v">${x.gh}-${x.ga}${x.pk ? ' PK' : ''}</span><span style="flex:1;text-align:right">${x.win === x.a ? '<b>' : ''}${esc(b.city)}${x.win === x.a ? '</b>' : ''}</span></li>`;
    }).join('')}</ul>`).join('');
    return `<h2 style="margin-top:12px">🏆 カップ戦</h2><p class="sub" style="margin:0">1部の10クラブと2部の上位6クラブの勝ち抜き戦（第4・8・12・16節）${cup.winner != null ? `。優勝：<b>${esc(club(cup.winner).name)}</b>` : ''}</p>
      ${lc ? `<p style="font-weight:800;margin:6px 0 0">あなたの直近のカップ戦（${esc(lc.round || '')}）：${lc.gf}-${lc.gc}　${lc.mins ? `評価${lc.rating.toFixed(1)}${lc.goals ? `・⚽${lc.goals}` : ''}` : '出番なし'}</p>` : ''}
      ${rounds || '<p class="empty">まだ試合がありません</p>'}`;
  }

  // ----- 全国ランキング（現役のプレイヤー全員） -----
  // タブを開いたときだけ取りに行き、1分間は取り直さない（無料枠を守る）
  const NR_KINDS = [
    ['score', '生涯スコア', (v) => `${v.toLocaleString()}pt`, 'いまの生涯スコア（今季の成績も含む）'],
    ['ovr', '総合力', (v) => v, 'いまの総合力'],
    ['FW', 'FW', (v) => v, 'FWの総合力'], ['MF', 'MF', (v) => v, 'MFの総合力'], ['DF', 'DF', (v) => v, 'DFの総合力'], ['GK', 'GK', (v) => v, 'GKの総合力'],
    ['rating', '平均評価', (v) => v.toFixed(2), '今季の平均評価点（10試合以上出場）'],
    ['salary', '年俸', (v) => man(v), 'いまの年俸'],
    ['money', '貯金', (v) => man(v), 'いまの貯金'],
  ];
  let NR = null, nrAt = 0, nrKind = 'score';
  async function renderNational(body) {
    if (!NR || Date.now() - nrAt > 60000) {
      body.innerHTML = '<p class="empty">読み込み中…</p>';
      const j = await api('/rankings');
      if (j.error) { body.innerHTML = `<p class="empty">${errMsg(j.error)}</p>`; return; }
      NR = j; nrAt = Date.now();
      if (tab !== 'national') return;
    }
    const [key, label, fmt, desc] = NR_KINDS.find((k) => k[0] === nrKind);
    const R = NR[key];
    body.innerHTML = `<div class="nrkinds">${NR_KINDS.map((k) => `<button data-k="${k[0]}" class="${k[0] === nrKind ? 'on' : ''}">${k[1]}</button>`).join('')}</div>
      <p class="sub" style="margin:0 0 6px">🌏 ${desc}・現役 ${R.total}人</p>
      ${R.mine ? `<div class="nrmine">あなたは <span style="color:var(--green);font-size:1.1rem">${R.mine.rank}位</span> / ${R.total}人（${fmt(R.mine.v)}）</div>` : key === 'rating' ? '<div class="nrmine sub">今季10試合以上出場すると載ります</div>' : ''}
      ${R.top.length ? `<ol class="list">${R.top.map((r, i) => `<li${r.me ? ' style="background:var(--chip)"' : ''}><span class="no">${i + 1}</span>${posTag(r.pos)}<span class="nm">${esc(r.name)} <span class="sub">${esc(r.club)}・${r.age}歳${r.gen > 1 ? `・${r.gen}代目` : ''}</span></span><span class="v">${fmt(r.v)}</span></li>`).join('')}</ol>` : '<p class="empty">まだ誰もいません</p>'}`;
    body.querySelectorAll('.nrkinds button').forEach((b) => b.onclick = () => { nrKind = b.dataset.k; renderNational(body); });
  }

  // 今季の個人ランキング（NPCも含む。サーバーで並べたものを読む）
  let RV = null;
  async function renderRanking(body, me, lg) {
    if (!RV) RV = { lg: String(lg), cat: me.pos === 'GK' ? 'saves' : me.pos === 'DF' ? 'defense' : me.pos === 'MF' ? 'assists' : 'goals', who: 'all' };
    const v = { ...RV };
    if (!body.querySelector('.rklist')) body.innerHTML = '<p class="empty">読み込み中…</p>';
    const j = await api(`/ranking?lg=${v.lg}&cat=${v.cat}&who=${v.who}`);
    if (tab !== 'rank' || JSON.stringify(v) !== JSON.stringify(RV)) return;
    body.innerHTML = '<h2>📊 今季の個人ランキング</h2>' + rankingHTML(RV, j && !j.error ? j : { top: [], total: 0, mine: null }, { userLabel: '本物のプレイヤー' });
    bindRanking(body, RV, () => renderRanking(body, me, lg));
  }
  function renderTab() {
    document.querySelectorAll('#ol-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const me = ST.me, lg = me.club != null ? club(me.club).lg : 1, body = $('tabBody');
    if (tab === 'table') {
      body.innerHTML = SL.LEAGUE_ORDER.map((i) => SL.LEAGUES[i]).filter((L) => ST.tables[L.id] && ST.tables[L.id].length).map((L, k) => `<div class="sub" style="margin:${k === 0 ? 0 : 12}px 0 4px;font-weight:800">${L.name}</div>
        <div class="tbwrap"><table class="tb"><tr><th></th><th style="text-align:left">クラブ</th><th>勝</th><th>分</th><th>敗</th><th>差</th><th>点</th></tr>
        ${ST.tables[L.id].map((t, i) => { const c = club(t.id); return `<tr class="${t.id === me.club ? 'me' : ''}"><td>${i + 1}</td><td class="l"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${c.humans ? `<span class="hum">👤${c.humans}</span>` : ''}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}</td><td><b>${t.p}</b></td></tr>`; }).join('')}</table></div>`).join('');
    } else if (tab === 'rank') {
      renderRanking(body, me, lg);
    } else if (tab === 'mates') {
      body.innerHTML = me.club == null ? '<p class="empty">所属なし</p>' : `${ST.squad ? squadHTML(club(me.club), ST.squad.rows, ST.squad.reserves) + '<h2 style="margin-top:12px">👥 本物のプレイヤーの今季</h2>' : `<h2>👥 ${esc(club(me.club).name)}のプレイヤー</h2>`}${ST.mates.length ? `<ul class="list">${ST.mates.map((m) => `<li>${posTag(m.pos)}<span class="nm">${esc(m.name)} <span class="sub">${m.age}歳${m.gen > 1 ? `・${m.gen}代目` : ''}</span></span><span class="v">${m.ovr}</span><span class="sub">${m.apps}試${m.goals}G${m.assists}A</span></li>`).join('')}</ul>` : '<p class="empty">ほかのプレイヤーはまだいません。友達を誘おう</p>'}`;
    } else if (tab === 'national') {
      renderNational(body);
    } else if (tab === 'cohort') {
      const C = ST.cohort || [];
      body.innerHTML = `<h2>🎓 ${ST.debutYear != null ? `${ST.debutYear}年デビュー組` : '同期'}のランキング</h2><p class="sub" style="margin:0 0 6px">同じ年にプロ入りした本物のプレイヤー同士の、いまの生涯スコア</p>${C.length ? `<ol class="list">${C.map((r, i) => `<li${r.me ? ' style="background:var(--chip)"' : ''}><span class="no">${i + 1}</span>${posTag(r.pos)}<span class="nm">${esc(r.name)} <span class="sub">${esc(r.club)}・${r.goals}G</span></span><span class="v">${r.score.toLocaleString()}</span></li>`).join('')}</ol>` : '<p class="empty">入団すると同期ランキングに載ります</p>'}`;
    } else if (tab === 'records') {
      const R = ST.records || {}, cr = ST.clubRecord, my = me.records || {};
      const top = (rows, unit, sub) => rows && rows.length ? `<ol class="list">${rows.map((r, i) => `<li><span class="no">${i + 1}</span><span class="nm">${esc(r.name)} <span class="sub">${esc(sub(r))}</span></span><span class="v">${r.v.toLocaleString()}${unit}</span></li>`).join('')}</ol>` : '<p class="empty">まだ記録がありません</p>';
      body.innerHTML = `<h2>📈 あなたの記録</h2><ul class="list">
          <li><span class="nm" style="font-weight:700">連続ゴール（いま / 最高）</span><span class="v">${my.goalStreak || 0} / ${my.bestGoalStreak || 0}</span></li>
          <li><span class="nm" style="font-weight:700">連続出場（いま / 最高）</span><span class="v">${my.playStreak || 0} / ${my.bestPlayStreak || 0}</span></li>
          <li><span class="nm" style="font-weight:700">1試合の最多得点</span><span class="v">${my.maxGoalsGame || 0}</span></li>
          <li><span class="nm" style="font-weight:700">週間最優秀選手</span><span class="v">${me.motw || 0}回</span></li></ul>
        ${cr ? `<h2 style="margin-top:12px">🏟️ ${esc(club(me.club).name)}の歴史</h2>
          <p class="sub" style="margin:0">優勝 ${cr.titles.length}回${cr.titles.length ? `（${cr.titles.slice(-5).map(esc).join('・')}）` : ''}・カップ優勝 ${cr.cups.length}回</p>
          <div class="sub" style="margin:8px 0 2px;font-weight:800">歴代のチーム得点王</div>${cr.scorers.length ? `<ul class="list">${cr.scorers.slice().reverse().map((x) => `<li><span class="nm">${x.year}年 ${esc(x.name)}</span><span class="v">${x.goals}G</span></li>`).join('')}</ul>` : '<p class="empty">まだいません</p>'}
          <div class="sub" style="margin:8px 0 2px;font-weight:800">クラブのレジェンド（出場数）</div>${cr.legends.length ? `<ol class="list">${cr.legends.map((x, i) => `<li><span class="no">${i + 1}</span><span class="nm">${esc(x.name)} <span class="sub">${x.goals}G</span></span><span class="v">${x.apps}</span></li>`).join('')}</ol>` : '<p class="empty">まだいません</p>'}` : ''}
        <h2 style="margin-top:12px">📜 リーグの全記録</h2>
        <div class="sub" style="font-weight:800;margin:4px 0 2px">シーズン最多得点</div>${top(R.seasonGoals, '点', (r) => `${r.year}年・${r.club}`)}
        <div class="sub" style="font-weight:800;margin:8px 0 2px">シーズン最多アシスト</div>${top(R.seasonAssists, '', (r) => `${r.year}年・${r.club}`)}
        <div class="sub" style="font-weight:800;margin:8px 0 2px">通算得点（引退した選手）</div>${top(R.careerGoals, '点', (r) => r.years)}
        <div class="sub" style="font-weight:800;margin:8px 0 2px">通算出場（引退した選手）</div>${top(R.careerApps, '', (r) => r.years)}
        <div class="sub" style="font-weight:800;margin:8px 0 2px">殿堂：生涯スコア</div>${top(R.careerScore, 'pt', (r) => `${r.letter}・「${r.title}」`)}`;
    } else if (tab === 'results') {
      const R = ST.results;
      body.innerHTML = !R ? '<p class="empty">まだ試合がありません</p>' : `<h2>📋 第${R.week}節の結果</h2><ul class="list">${R.list.map((r) => {
        const h = club(r.h), a = club(r.a);
        const g = r.goals.filter((x) => x.who || x.assist).map((x) => `${x.min}' ${esc(x.who || '')}${x.assist ? `（A ${esc(x.assist)}）` : ''}`).join('、');
        return `<li style="display:block"><span class="dot" style="background:${h.color}"></span>${esc(h.city)} <b class="num">${r.gh} - ${r.ga}</b> ${esc(a.city)} <span class="dot" style="background:${a.color};margin-left:4px"></span><span class="sub">${SL.LEAGUES[r.lg].short}</span>${g ? `<div class="sub">⚽ ${g}</div>` : ''}</li>`;
      }).join('')}</ul>${ST.seasonHistory.length ? `<h2 style="margin-top:12px">🏆 過去の優勝</h2><ul class="list">${ST.seasonHistory.map((x) => `<li style="display:block"><b>${x.year}年</b> <span class="sub">${SL.LEAGUE_ORDER.filter((i) => x.champions[i]).map((i) => `${SL.LEAGUES[i].short} ${esc(x.champions[i])}`).join('／')}</span></li>`).join('')}</ul>` : ''}${ST.seasonHistory.some((x) => x.awards) ? `<h2 style="margin-top:12px">🏅 歴代の受賞者（${SL.LEAGUES[lg].name}）</h2>${awardHistoryHTML(ST.seasonHistory.map((x) => x.awards).filter(Boolean), String(lg))}` : ''}<h2 style="margin-top:12px">🌟 NPCレジェンド</h2>${legendsHTML(ST.records && ST.records.npcLegends)}${cupResultsHTML()}`;
    } else {
      const aw = me.trophies.map((t) => `<li>🏆 ${esc(t)}</li>`).concat(me.awards.map((t) => `<li>🏅 ${esc(t)}</li>`));
      body.innerHTML = `<div class="bigstat"><div>通算出場<b>${me.totals.apps}</b></div><div>通算G<b>${me.totals.goals}</b></div><div>通算A<b>${me.totals.assists}</b></div><div>代表<b>${me.caps}</b></div></div>
        ${aw.length ? `<ul class="ach">${aw.join('')}</ul>` : ''}
        ${me.history.length ? `<div class="tbwrap" style="margin-top:10px"><table class="tb"><tr><th>年</th><th>歳</th><th style="text-align:left">クラブ</th><th>試</th><th>G</th><th>A</th><th>評価</th></tr>${me.history.map((r) => `<tr><td>${String(r.year).slice(2)}</td><td>${r.age}</td><td class="l">${esc(r.club)}</td><td>${r.apps}</td><td>${r.goals}</td><td>${r.assists}</td><td>${r.rating ? r.rating.toFixed(2) : '-'}</td></tr>`).join('')}</table></div>` : '<p class="empty">1年目のシーズン中</p>'}
        ${me.lineage.length ? `<h2 style="margin-top:12px">🌳 一族</h2><ul class="list">${me.lineage.map((l) => `<li><span class="no">${l.gen}</span><span class="nm">${esc(l.name)} <span class="sub">「${esc(l.title)}」${l.years}</span></span><span class="v" style="color:var(--gold)">${l.letter}</span></li>`).join('')}</ul>` : ''}
        ${me.log.length ? `<h2 style="margin-top:12px">📝 できごと</h2><ul class="list">${me.log.slice().reverse().map((l) => `<li class="sub" style="display:block">${esc(l.t)}</li>`).join('')}</ul>` : ''}`;
    }
  }

  // ===== 画面の振り分け =====
  function route() {
    if (!ST) return renderStart();
    if (ST.me.status === 'draft') return renderDraft();
    renderHome();
  }
  async function load() {
    if (!CODE) return renderStart();
    const j = await api('/state');
    if (j.error === 'unauthorized') { CODE = null; store.del('code'); return renderStart(); }
    if (j.error) { toast(errMsg(j.error)); return ST ? route() : renderStart(); }
    setState(j); route();
    if (j.bonus) toast(`🎁 ログインボーナス +${j.bonus.amount}万円`);
    if (j.idleRetired) toast('💤 30日以上来なかったので、休眠のまま引退しました。次の世代から始められます');
  }

  // 自動では何度も取りに行かない（無料枠を守る）。節が進んだ直後に1回だけ取り直す
  setInterval(() => {
    if (!ST || $('scrHome').classList.contains('hidden')) return;
    $('topCd').textContent = countdown();
    const due = ST.world.nextAt + 8000 - (Date.now() + skew);
    if (due < 0 && Date.now() - fetchedAt > 30000 && document.visibilityState === 'visible') load();
    // ルーレットに賭けているときだけ、回った直後に1回取りに行く
    const cz = ST.casino;
    if (cz && cz.myBets.length && cz.nextAt + 3000 - (Date.now() + skew) < 0 && Date.now() - fetchedAt > 15000 && document.visibilityState === 'visible' && !document.querySelector('.sheet.casino')) load();
  }, 1000);
  // 満員のときの「一人用モードで遊ぶ」
  document.addEventListener('click', (e) => { if (e.target.closest('.ol-solo')) location.href = location.pathname; });
  // 移籍方針の「変える」（ホーム・オフの画面）
  document.addEventListener('click', (e) => { if (e.target.closest('#ol-polBtn, #ol-polBtn2')) openPolicy(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ST && Date.now() - fetchedAt > 60000) load(); });

  $('startBtn').onclick = () => renderCreate(false);
  $('createBack').onclick = () => (ST && ST.me.status === 'retired' ? renderHome() : renderStart());
  $('signupBtn').onclick = signup;
  $('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') signup(); });
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(CODE); toast('コピーしました'); } catch { toast('長押しでコピーしてください'); } };
  $('codeOkBtn').onclick = () => route();
  $('loginBtn').onclick = async () => {
    const code = $('codeIn').value.trim().toUpperCase(); if (!code) return;
    CODE = code; const j = await api('/state');
    if (j.error) { CODE = store.get('code'); $('loginMsg').textContent = errMsg(j.error); return; }
    store.set('code', code); setState(j); route();
  };
  $('refreshBtn').onclick = load;
  // 画面下のナビ：ホーム / 前の試合 / チーム / ランキング / キャリア
  {
    const home = document.getElementById('ol-scrHome');
    const nav = document.createElement('div'); nav.className = 'actions olnav';
    nav.innerHTML = '<div class="navrow" id="ol-nav"><button data-go="top"><b>🏠</b>ホーム</button><button data-go="last"><b>📺</b>前の試合</button><button data-go="mates"><b>👥</b>チーム</button><button data-go="rank"><b>🏅</b>ランキング</button><button data-go="career"><b>📜</b>キャリア</button></div>';
    home.appendChild(nav);
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !ST) return;
      const go = b.dataset.go;
      if (go === 'top') return window.scrollTo({ top: 0, behavior: 'smooth' });
      if (go === 'last') return (document.getElementById('ol-lastCard').classList.contains('hidden') ? $('pCard') : document.getElementById('ol-lastCard')).scrollIntoView({ behavior: 'smooth', block: 'start' });
      tab = go; renderTab();
      $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // 自分のカードをタップするとプロフィール
    $('pCard').addEventListener('click', () => {
      if (!ST || !ST.me || ST.me.club == null) return;
      const me = ST.me;
      openProfile({ appeal: me.appeal, move: me.move, outlook: me.outlook, depth: me.depth, canEditMove: true,
        onMove: async (v) => { const j = await api('/move', { move: v }); if (j.error) { toast(errMsg(j.error)); return undefined; } setState(j); return j.me.move; },
        name: me.name, pos: me.pos, age: me.age, ovr: me.ovr, best: me.best, number: me.number, club: club(me.club), stats: me.stats, grow: me.grow, gtype: me.gtype, growKnown: !!me.grow,
        salary: me.salary, contract: me.contract, totals: me.totals, season: me.season, awards: me.awards, trophies: me.trophies, history: me.history });
    });
  }
  // カジノ（オンライン：当たり外れはサーバーが決める）
  // 全員共通の台。3分ごとにサーバーが1回だけ回す
  const tableErr = (j) => (j && j.error ? { error: /^[a-z_]+$/.test(j.error) ? errMsg(j.error) : j.error } : j);
  $('casinoBtn').onclick = () => openRouletteTable({
    load: async () => tableErr(await api('/casino')),
    bet: async (bets) => tableErr(await api('/casino/bet', { bets })),
    onClose: () => load(),
  });
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; renderTab(); } });
  $('revealBtn').onclick = () => { $('myCode').textContent = CODE; };
  $('logoutBtn').onclick = () => {
    if (!confirm('ログアウトします。引き継ぎコードをメモしていないと、二度と戻れません。よろしいですか？')) return;
    CODE = null; ST = null; store.del('code'); renderStart();
  };
  $('backBtn').onclick = $('homeBackBtn').onclick = () => { history.replaceState(null, '', location.pathname); renderTitle(); };

  // 一人用のタイトル画面にある「オンラインリーグ」の入口
  async function entryCard() {
    const info = document.getElementById('olEntryInfo'), btn = document.getElementById('olEntryBtn');
    if (!info) return;
    btn.textContent = CODE ? 'オンラインの続きから ▶' : 'オンラインで遊ぶ ▶';
    const j = await api('/public');
    info.textContent = j.error ? '' : `いま ${j.world.year}年・${j.world.phase === 'season' ? `第${j.world.week}節` : 'オフシーズン'}・${j.world.players}人が参加中`;
  }
  document.getElementById('olEntryBtn').onclick = load;
  window.OL = { open: load, entryCard };
  entryCard();
  if (location.hash === '#online') load();
})();
