// アフィリエイト広告（もしもアフィリエイト）を置く部品。全アプリ共通
//   TonmatoAds.show(el, 'wowow')  … el の中に広告を出す（「PR」の表示つき）
//   TonmatoAds.show(el, 'wowowTop', 'top') … 画面の上に置くとき（余白を小さく）
// 広告を出すのは Cloudflare 版（tonmatolab.tonmatolab.workers.dev）だけ。GitHub 版には出さない（GitHub Pages は商用に使えないため）
// 手元で確かめるときは、アドレスの最後に ?ad=1 を付ける
(function () {
  'use strict';
  const HOST = 'tonmatolab.tonmatolab.workers.dev';
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]ad=1\b/.test(location.search);
  const enabled = location.hostname === HOST || local;
  // 広告の一覧（もしもアフィリエイトでもらったコードを、https にしてそのまま入れる）
  const ADS = {
    // 楽天市場（380×60）：トップページへのバナー
    rakutenBanner: `<a href="https://af.moshimo.com/af/c/click?a_id=5930233&p_id=54&pc_id=54&pl_id=1221" rel="nofollow sponsored" referrerpolicy="no-referrer-when-downgrade" attributionsrc target="_blank"><img src="https://image.moshimo.com/af-img/0032/000000001221.gif" width="380" height="60" alt="楽天市場" style="border:none;max-width:100%;height:auto" loading="lazy"></a><img src="https://i.moshimo.com/af/i/impression?a_id=5930233&p_id=54&pc_id=54&pl_id=1221" width="1" height="1" style="border:none" alt="" loading="lazy">`,
    // WOWOW（320×50）：画面の上に置く横長
    wowowTop: `<a href="https://af.moshimo.com/af/c/click?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69388" rel="nofollow sponsored" referrerpolicy="no-referrer-when-downgrade" attributionsrc target="_blank"><img src="https://image.moshimo.com/af-img/4982/000000069388.jpg" width="320" height="50" alt="WOWOW" style="border:none;max-width:100%;height:auto"></a><img src="https://i.moshimo.com/af/i/impression?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69388" width="1" height="1" style="border:none" alt="" loading="lazy">`,
    // WOWOW（300×250）
    wowow: `<a href="https://af.moshimo.com/af/c/click?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69387" rel="nofollow sponsored" referrerpolicy="no-referrer-when-downgrade" attributionsrc target="_blank"><img src="https://image.moshimo.com/af-img/4982/000000069387.jpg" width="300" height="250" alt="WOWOW" style="border:none;max-width:100%;height:auto" loading="lazy"></a><img src="https://i.moshimo.com/af/i/impression?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69387" width="1" height="1" style="border:none" alt="" loading="lazy">`,
  };
  // 文字のボタンにする広告（もしものリンクの href と、表示を数える 1px 画像の URL）
  const LINKS = {
    // 楽天市場（トップページへ。そこから24時間以内に買ったものが報酬になる）
    rakuten: { href: 'https://af.moshimo.com/af/c/click?a_id=5930233&p_id=54&pc_id=54&pl_id=1221', imp: 'https://i.moshimo.com/af/i/impression?a_id=5930233&p_id=54&pc_id=54&pl_id=1221' },
  };
  // かんたんリンク（商品カード）。もしもでもらったコードの msmaflink({...}) の中身をそのまま入れる
  const EASY = {
    // ドトール ドリップパック バラエティ（楽天）
    doutorDrip: {"n":"ドトール ドリップパック バラエティパック(7g×40袋)【ドトール】[ドトール コーヒー ドリップ アソート]","b":"","t":"","d":"https:\/\/thumbnail.image.rakuten.co.jp","c_p":"\/@0_mall\/soukaidrink\/cabinet\/833","p":["\/4932707028833.jpg","\/4932707028833-2.jpg","\/4932707028833-3.jpg"],"u":{"u":"https:\/\/item.rakuten.co.jp\/soukaidrink\/4932707028833\/","t":"rakuten","r_v":""},"v":"2.1","b_l":[{"id":1,"u_tx":"楽天市場で見る","u_bc":"#f76956","u_url":"https:\/\/item.rakuten.co.jp\/soukaidrink\/4932707028833\/","a_id":5930233,"p_id":54,"pl_id":27059,"pc_id":54,"s_n":"rakuten","u_so":1}],"eid":"woNlx","s":"xs"},
  };
  // もしもの読み込みコード（公式のものと同じ動き）。最初に使うときだけ読み込む
  function easyLink(data) {
    const w = window, d = document;
    w.MoshimoAffiliateObject = 'msmaflink';
    w.msmaflink = w.msmaflink || function () { (w.msmaflink.q = w.msmaflink.q || []).push(arguments); };
    if (!d.getElementById('msmaflink')) {
      const s = d.createElement('script');
      s.src = 'https://dn.msmstatic.com/site/cardlink/bundle.js?20220329'; s.id = 'msmaflink';
      d.body.appendChild(s);
    }
    w.msmaflink(data);
  }
  const css = `.tn-ad { text-align: center; margin: 18px auto 0; max-width: 320px; }
    .tn-ad .tn-pr { display: block; text-align: left; font-size: .62rem; font-weight: 800; letter-spacing: .08em; opacity: .55; margin: 0 0 3px 10px; }
    .tn-ad:not(.easy) a { display: inline-block; line-height: 0; }
    .tn-ad.top { margin: 4px auto 8px; }
    .tn-ad.top .tn-pr { margin: 0 0 2px 2px; }
    .tn-ad.easy { text-align: left; margin-top: 10px; }
    .tn-ad.easy .tn-pr { margin-left: 2px; }`;
  let styled = false;
  function show(el, id, kind = '') {
    if (!enabled || !el || !(ADS[id] || EASY[id])) return false;
    if (el.dataset.ad === id) return true; // もう出している（開き直すたびに表示の数を増やさない）
    if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    if (EASY[id]) {
      el.innerHTML = `<div class="tn-ad easy ${kind}"><span class="tn-pr">PR</span><div id="msmaflink-${EASY[id].eid}"></div></div>`;
      easyLink(EASY[id]);
    } else el.innerHTML = `<div class="tn-ad ${kind}"><span class="tn-pr">PR</span>${ADS[id]}</div>`;
    el.dataset.ad = id;
    el.classList.remove('hidden');
    return true;
  }
  // 文字のボタンを a 要素で返す（出さないときは null）。見た目は呼ぶ側のアプリで決める
  function link(id, html) {
    const L = LINKS[id];
    if (!enabled || !L) return null;
    const a = document.createElement('a');
    a.href = L.href; a.target = '_blank'; a.rel = 'nofollow sponsored noopener';
    a.referrerPolicy = 'no-referrer-when-downgrade'; a.setAttribute('attributionsrc', '');
    a.innerHTML = html + `<img src="${L.imp}" width="1" height="1" alt="" loading="lazy" style="border:none;position:absolute;opacity:0">`;
    return a;
  }
  window.TonmatoAds = { enabled, show, link };
})();
