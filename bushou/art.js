// ===== 武将の肖像と家紋（SVGで自動生成） =====
'use strict';

let _uid = 0;
const uid = (p) => `${p}${++_uid}`;

// 家紋：中心(cx,cy)、半径r
function kamonSVG(k, color, cx, cy, r, bg = 'none') {
  let s = '';
  if (bg !== 'none') s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}"/>`;
  if (k.ring) s += `<circle cx="${cx}" cy="${cy}" r="${r * .92}" fill="none" stroke="${color}" stroke-width="${r * .1}"/>`;
  const R = k.ring ? r * .72 : r * .9;
  const off = k.rot ? Math.PI / k.n : 0;
  for (let i = 0; i < k.n; i++) {
    const a = -Math.PI / 2 + off + (i / k.n) * Math.PI * 2;
    const px = cx + Math.cos(a) * R * .5, py = cy + Math.sin(a) * R * .5;
    const deg = a * 180 / Math.PI + 90;
    const pr = R * (k.n > 5 ? .36 : .46);
    if (k.shape === 'circle') s += `<circle cx="${px}" cy="${py}" r="${pr}" fill="${color}"/>`;
    else if (k.shape === 'leaf') s += `<ellipse cx="${px}" cy="${py}" rx="${pr * .55}" ry="${pr}" transform="rotate(${deg} ${px} ${py})" fill="${color}"/>`;
    else if (k.shape === 'diamond') s += `<rect x="${px - pr * .6}" y="${py - pr * .6}" width="${pr * 1.2}" height="${pr * 1.2}" transform="rotate(${deg + 45} ${px} ${py})" fill="${color}"/>`;
    else if (k.shape === 'wedge') s += `<path d="M${cx} ${cy} L${cx + Math.cos(a - .32) * R} ${cy + Math.sin(a - .32) * R} A${R} ${R} 0 0 1 ${cx + Math.cos(a + .32) * R} ${cy + Math.sin(a + .32) * R} Z" fill="${color}"/>`;
    else s += `<path d="M${px} ${py - pr} Q${px + pr * .9} ${py + pr * .3} ${px} ${py + pr * .9} Q${px - pr * .9} ${py + pr * .3} ${px} ${py - pr} Z" transform="rotate(${deg} ${px} ${py})" fill="${color}"/>`;
  }
  if (k.inner === 'dot') s += `<circle cx="${cx}" cy="${cy}" r="${R * .16}" fill="${color}"/>`;
  else if (k.inner === 'ring') s += `<circle cx="${cx}" cy="${cy}" r="${R * .2}" fill="none" stroke="${color}" stroke-width="${R * .07}"/>`;
  else if (k.inner === 'petals') for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; s += `<circle cx="${cx + Math.cos(a) * R * .14}" cy="${cy + Math.sin(a) * R * .14}" r="${R * .07}" fill="${color}"/>`; }
  return `<g>${s}</g>`;
}

// 肖像（viewBox 0 0 200 240）
function portraitSVG(b, opt = {}) {
  const L = b.look, id = uid('p');
  const ink = '#16120f';
  const st = `stroke="${ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  const rc = b.rarity.color, glow = b.rarity.glow;
  let s = '';
  // 背景
  s += `<defs>
    <radialGradient id="${id}bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${glow}"/><stop offset=".55" stop-color="${rc}"/><stop offset="1" stop-color="#16120f"/></radialGradient>
    <linearGradient id="${id}ar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${L.armor}"/><stop offset=".5" stop-color="${shade(L.armor, 30)}"/><stop offset="1" stop-color="${shade(L.armor, -20)}"/></linearGradient>
    <linearGradient id="${id}hm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(L.helm, 40)}"/><stop offset="1" stop-color="${L.helm}"/></linearGradient>
  </defs>`;
  s += `<rect width="200" height="240" fill="url(#${id}bg)"/>`;
  if (['mei', 'ten', 'den'].includes(b.rarity.id)) {
    let rays = '';
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, a2 = a + .07; rays += `<path d="M100 100 L${100 + Math.cos(a) * 260} ${100 + Math.sin(a) * 260} L${100 + Math.cos(a2) * 260} ${100 + Math.sin(a2) * 260} Z"/>`; }
    s += `<g fill="#fff" opacity="${b.rarity.id === 'den' ? .22 : .13}">${rays}</g>`;
  }
  // 旗指物（背中の旗）
  s += `<line x1="160" y1="8" x2="160" y2="240" stroke="#5a3d22" stroke-width="4"/>`;
  s += `<rect x="160" y="10" width="34" height="88" fill="${L.flag}" stroke="${ink}" stroke-width="2"/>`;
  s += kamonSVG(b.kamon, contrast(L.flag), 177, 36, 13);
  // 胴（鎧）
  s += `<path d="M34 240 L46 176 Q100 158 154 176 L166 240 Z" fill="url(#${id}ar)" ${st}/>`;
  for (let y = 188; y < 240; y += 10) s += `<path d="M${44 - (y - 188) * .1} ${y} Q100 ${y - 6} ${156 + (y - 188) * .1} ${y}" fill="none" stroke="${L.lace}" stroke-width="2.4" opacity=".9"/>`;
  s += kamonSVG(b.kamon, '#e8c14a', 100, 208, 13);
  // 袖（肩の板）
  s += `<path d="M22 182 L56 170 L62 222 L26 232 Z" fill="${L.armor}" ${st}/><path d="M178 182 L144 170 L138 222 L174 232 Z" fill="${L.armor}" ${st}/>`;
  for (let i = 0; i < 4; i++) { const y = 186 + i * 11; s += `<path d="M${25 + i} ${y + 2} L${57 + i * .3} ${y - 9}" stroke="${L.lace}" stroke-width="2"/><path d="M${175 - i} ${y + 2} L${143 - i * .3} ${y - 9}" stroke="${L.lace}" stroke-width="2"/>`; }
  // 首
  s += `<rect x="86" y="150" width="28" height="22" fill="${shade(L.skin, -15)}" ${st}/>`;
  // しころ（兜の首まわり）
  s += `<path d="M56 110 Q46 142 54 162 L76 152 Q68 132 70 112 Z" fill="${L.helm}" ${st}/><path d="M144 110 Q154 142 146 162 L124 152 Q132 132 130 112 Z" fill="${L.helm}" ${st}/>`;
  // 顔
  s += `<ellipse cx="100" cy="127" rx="31" ry="37" fill="${L.skin}" ${st}/>`;
  s += `<path d="M78 150 Q100 166 122 150" fill="none" stroke="${shade(L.skin, -25)}" stroke-width="2" opacity=".6"/>`;
  // 目
  const eyes = {
    fierce: `<path d="M77 120 L95 124 L93 130 L79 127 Z M123 120 L105 124 L107 130 L121 127 Z" fill="#fff" ${st} stroke-width="2"/><circle cx="88" cy="126" r="2.8" fill="${ink}"/><circle cx="112" cy="126" r="2.8" fill="${ink}"/>`,
    round: `<circle cx="87" cy="125" r="6.5" fill="#fff" ${st} stroke-width="2"/><circle cx="113" cy="125" r="6.5" fill="#fff" ${st} stroke-width="2"/><circle cx="88" cy="126" r="3.2" fill="${ink}"/><circle cx="112" cy="126" r="3.2" fill="${ink}"/>`,
    sleepy: `<path d="M79 126 Q87 122 95 126 M105 126 Q113 122 121 126" fill="none" ${st}/><path d="M80 127 Q87 131 94 127 M106 127 Q113 131 120 127" fill="none" stroke="${ink}" stroke-width="1.6"/>`,
    glare: `<path d="M78 124 L96 125 M104 125 L122 124" ${st} stroke-width="3.5"/><circle cx="88" cy="125" r="1.8" fill="#e8432f"/><circle cx="112" cy="125" r="1.8" fill="#e8432f"/>`,
  };
  s += eyes[L.eyes];
  if (L.eyepatch) s += `<path d="M104 118 L124 118 L122 132 L106 132 Z" fill="${ink}"/><path d="M70 112 L130 120" stroke="${ink}" stroke-width="2"/>`;
  if (L.scar) s += `<path d="M80 112 L96 138" stroke="#b23a2b" stroke-width="2.4"/>`;
  // 眉
  const brows = {
    angry: `<path d="M74 113 L96 119 L95 115 L75 108 Z M126 113 L104 119 L105 115 L125 108 Z" fill="${ink}"/>`,
    flat: `<path d="M75 113 L96 113 L96 109 L75 109 Z M125 113 L104 113 L104 109 L125 109 Z" fill="${ink}"/>`,
    sad: `<path d="M75 110 L96 115 L96 111 L76 106 Z M125 110 L104 115 L104 111 L124 106 Z" fill="${ink}" transform="rotate(8 100 112)"/>`,
  };
  s += brows[L.brows];
  // 鼻
  s += `<path d="M100 128 L96 140 L103 140" fill="none" stroke="${ink}" stroke-width="2"/>`;
  // 口・面頬（めんぼお）
  if (L.mask) {
    s += `<path d="M72 138 Q100 132 128 138 L124 160 Q100 172 76 160 Z" fill="#7a1f1f" ${st}/>`;
    s += `<path d="M84 150 L116 150" stroke="#f2f2f2" stroke-width="3"/><path d="M88 146 L88 154 M94 146 L94 154 M100 146 L100 154 M106 146 L106 154 M112 146 L112 154" stroke="${ink}" stroke-width="1.5"/>`;
    s += `<path d="M78 142 Q72 146 76 150 M122 142 Q128 146 124 150" fill="none" stroke="#f2f2f2" stroke-width="2"/>`;
  } else {
    const mouth = {
      grin: `<path d="M86 148 Q100 158 114 148 Q100 153 86 148 Z" fill="#fff" ${st} stroke-width="2"/>`,
      shout: `<ellipse cx="100" cy="151" rx="10" ry="8" fill="#5a1414" ${st} stroke-width="2"/><path d="M92 146 L108 146" stroke="#fff" stroke-width="2.5"/>`,
      frown: `<path d="M88 153 Q100 146 112 153" fill="none" ${st}/>`,
      smirk: `<path d="M88 151 Q102 152 113 145" fill="none" ${st}/>`,
    };
    s += mouth[L.mouth];
    const beard = {
      none: '',
      mustache: `<path d="M84 145 Q92 139 100 143 Q108 139 116 145 Q108 143 100 147 Q92 143 84 145 Z" fill="${ink}"/>`,
      full: `<path d="M70 132 Q72 166 100 170 Q128 166 130 132 Q124 152 112 156 Q100 162 88 156 Q76 152 70 132 Z" fill="${ink}"/><path d="M84 145 Q100 139 116 145" stroke="${ink}" stroke-width="4" fill="none"/>`,
      goatee: `<path d="M94 158 Q100 172 106 158 Z" fill="${ink}"/><path d="M86 145 Q100 140 114 145" stroke="${ink}" stroke-width="3" fill="none"/>`,
    };
    s += beard[L.beard];
  }
  // 兜
  s += `<path d="M60 112 Q100 50 140 112 Q100 100 60 112 Z" fill="url(#${id}hm)" ${st}/>`;
  for (let i = 1; i < 8; i++) { const x = 60 + i * 10; s += `<path d="M${x} ${110 - Math.sin(i / 8 * Math.PI) * 12} Q${100 + (x - 100) * .3} ${72} 100 64" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.4"/>`; }
  s += `<path d="M58 112 Q100 102 142 112 L142 118 Q100 108 58 118 Z" fill="${shade(L.helm, 25)}" ${st} stroke-width="2"/>`;
  // 吹返し（兜の左右のそり返し）
  s += `<path d="M60 112 L40 102 L46 126 L64 118 Z" fill="${L.helm}" ${st}/><path d="M140 112 L160 102 L154 126 L136 118 Z" fill="${L.helm}" ${st}/>`;
  s += kamonSVG(b.kamon, L.crestColor, 51, 114, 6.5);
  s += kamonSVG(b.kamon, L.crestColor, 149, 114, 6.5);
  // 前立て（兜の飾り）
  const c = L.crestColor;
  const crest = {
    kuwagata: `<path d="M100 84 Q70 64 62 16 Q84 52 100 76 Z M100 84 Q130 64 138 16 Q116 52 100 76 Z" fill="${c}" ${st} stroke-width="2"/>`,
    mikazuki: `<path d="M52 44 Q100 104 148 44 Q100 84 52 44 Z" fill="${c}" ${st} stroke-width="2"/>`,
    nichirin: `<circle cx="100" cy="56" r="20" fill="#e8432f" ${st}/><circle cx="100" cy="56" r="26" fill="none" stroke="${c}" stroke-width="4"/>`,
    usagi: `<ellipse cx="88" cy="40" rx="8" ry="30" transform="rotate(-12 88 40)" fill="${c}" ${st} stroke-width="2"/><ellipse cx="112" cy="40" rx="8" ry="30" transform="rotate(12 112 40)" fill="${c}" ${st} stroke-width="2"/>`,
    shika: `<path d="M94 80 L80 40 L66 30 M80 40 L84 22 M86 56 L70 52 M106 80 L120 40 L134 30 M120 40 L116 22 M114 56 L130 52" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/><path d="M94 80 L80 40 L66 30 M80 40 L84 22 M86 56 L70 52 M106 80 L120 40 L134 30 M120 40 L116 22 M114 56 L130 52" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round"/>`,
    honoo: `<path d="M100 84 Q76 64 88 40 Q90 54 98 54 Q92 32 106 12 Q104 36 116 42 Q120 30 118 24 Q134 50 112 82 Z" fill="#e8432f" ${st} stroke-width="2"/><path d="M100 80 Q92 66 100 50 Q104 64 110 66 Q108 76 100 80 Z" fill="#ffd36b"/>`,
    hoshi: `<path d="M100 22 L108 46 L134 46 L113 61 L121 86 L100 71 L79 86 L87 61 L66 46 L92 46 Z" fill="${c}" ${st} stroke-width="2"/>`,
    kamon: `<circle cx="100" cy="56" r="24" fill="${ink}"/>` + kamonSVG(b.kamon, c, 100, 56, 21),
  };
  s += crest[L.crest];
  // 伝説はオーラ
  if (b.rarity.id === 'den') s += `<rect width="200" height="240" fill="none" stroke="#ffd36b" stroke-width="6"/>`;
  return dedupeAttrs(`<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" ${opt.attrs || ''}>${s}</svg>`);
}

// 同じ属性が重なっていると画像として読み込めないので、後に書いたほうだけ残す
function dedupeAttrs(svg) {
  return svg.replace(/<([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")+)\s*(\/?)>/g, (m, name, attrs, slash) => {
    const map = new Map();
    attrs.replace(/([a-zA-Z:-]+)="([^"]*)"/g, (_, k, v) => { map.delete(k); map.set(k, v); return ''; });
    return '<' + name + [...map].map(([k, v]) => ` ${k}="${v}"`).join('') + (slash ? '/' : '') + '>';
  });
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114);
  return l > 150 ? '#16120f' : '#ffffff';
}

// レーダーチャート（5角形）
function radarSVG(stats, color) {
  const keys = ['bu', 'tou', 'chi', 'sei', 'un'], names = ['武力', '統率', '知略', '政治', '運'];
  const cx = 70, cy = 70, R = 50;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  let s = '';
  for (const lv of [1, .66, .33]) s += `<polygon points="${keys.map((_, i) => pt(i, lv).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".2"/>`;
  s += `<polygon points="${keys.map((k, i) => pt(i, stats[k] / 100).join(',')).join(' ')}" fill="${color}" fill-opacity=".45" stroke="${color}" stroke-width="2"/>`;
  names.forEach((n, i) => { const [x, y] = pt(i, 1.28); s += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor">${n}</text>`; });
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}
