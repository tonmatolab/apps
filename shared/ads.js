// アフィリエイト広告（もしもアフィリエイト）を置く部品。全アプリ共通
//   TonmatoAds.show(el, 'wowow')  … el の中に広告を出す（「PR」の表示つき）
// 広告を出すのは Cloudflare 版（tonmatolab.tonmatolab.workers.dev）だけ。GitHub 版には出さない（GitHub Pages は商用に使えないため）
// 手元で確かめるときは、アドレスの最後に ?ad=1 を付ける
(function () {
  'use strict';
  const HOST = 'tonmatolab.tonmatolab.workers.dev';
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]ad=1\b/.test(location.search);
  const enabled = location.hostname === HOST || local;
  // 広告の一覧（もしもアフィリエイトでもらったコードを、https にしてそのまま入れる）
  const ADS = {
    // WOWOW（300×250）
    wowow: `<a href="https://af.moshimo.com/af/c/click?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69387" rel="nofollow sponsored" referrerpolicy="no-referrer-when-downgrade" attributionsrc target="_blank"><img src="https://image.moshimo.com/af-img/4982/000000069387.jpg" width="300" height="250" alt="WOWOW" style="border:none;max-width:100%;height:auto" loading="lazy"></a><img src="https://i.moshimo.com/af/i/impression?a_id=5930234&p_id=5300&pc_id=14446&pl_id=69387" width="1" height="1" style="border:none" alt="" loading="lazy">`,
  };
  const css = `.tn-ad { text-align: center; margin: 18px auto 0; max-width: 320px; }
    .tn-ad .tn-pr { display: block; text-align: left; font-size: .62rem; font-weight: 800; letter-spacing: .08em; opacity: .55; margin: 0 0 3px 10px; }
    .tn-ad a { display: inline-block; line-height: 0; }`;
  let styled = false;
  function show(el, id) {
    if (!enabled || !el || !ADS[id]) return false;
    if (el.dataset.ad === id) return true; // もう出している（開き直すたびに表示の数を増やさない）
    if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    el.innerHTML = `<div class="tn-ad"><span class="tn-pr">PR</span>${ADS[id]}</div>`;
    el.dataset.ad = id;
    el.classList.remove('hidden');
    return true;
  }
  window.TonmatoAds = { enabled, show };
})();
