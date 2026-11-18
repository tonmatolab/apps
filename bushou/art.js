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
// 2頭身のデフォルメ。キャラ全体を白フチのシールにして、天下人・伝説はホロ加工
function portraitSVG(b, opt = {}) {
  const L = b.look, id = uid('p');
  const ink = '#16120f';
  const st = `stroke="${ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  const rc = b.rarity.color, glow = b.rarity.glow;
  const rid = b.rarity.id;
  const rare = ['mei', 'ten', 'den'].includes(rid), holo = rid === 'ten' || rid === 'den';
  const sk = new Set((b.skills || []).map((x) => x && x.id));
  const txt = (x, y, size, t, fill = '#fff', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="${fill}" stroke="${ink}" stroke-width="${size / 6}" paint-order="stroke" stroke-linejoin="round" ${extra}>${t}</text>`;
  let s = '';
  s += `<defs>
    <radialGradient id="${id}bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${glow}"/><stop offset=".55" stop-color="${rc}"/><stop offset="1" stop-color="#16120f"/></radialGradient>
    <linearGradient id="${id}ar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${L.armor}"/><stop offset=".5" stop-color="${shade(L.armor, 30)}"/><stop offset="1" stop-color="${shade(L.armor, -20)}"/></linearGradient>
    <linearGradient id="${id}hm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(L.helm, 40)}"/><stop offset="1" stop-color="${L.helm}"/></linearGradient>
    <filter id="${id}st" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="4.5" result="d"/>
      <feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="w"/>
      <feOffset in="d" dx="2" dy="4" result="o"/><feFlood flood-color="#000" flood-opacity=".45"/><feComposite in2="o" operator="in" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${holo ? `<linearGradient id="${id}ho" x1="0" y1="0" x2="90" y2="110" gradientUnits="userSpaceOnUse" spreadMethod="reflect">
      <stop offset="0" stop-color="#ff5f6d"/><stop offset=".2" stop-color="#ffc371"/><stop offset=".38" stop-color="#fff58a"/><stop offset=".55" stop-color="#6bffb8"/><stop offset=".72" stop-color="#5ecbff"/><stop offset=".88" stop-color="#b37bff"/><stop offset="1" stop-color="#ff7ad9"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="0 0;90 110;0 0" dur="6s" repeatCount="indefinite"/>
    </linearGradient>
    <linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="1"><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>` : ''}
  </defs>`;
  // 背景
  s += `<rect width="200" height="240" fill="url(#${id}bg)"/>`;
  if (rare) {
    let rays = '';
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, a2 = a + .07; rays += `<path d="M100 100 L${100 + Math.cos(a) * 260} ${100 + Math.sin(a) * 260} L${100 + Math.cos(a2) * 260} ${100 + Math.sin(a2) * 260} Z"/>`; }
    s += `<g fill="#fff" opacity="${rid === 'den' ? .22 : .13}">${rays}</g>`;
  }

  // ===== ここからシールになる部分 =====
  let ch = '';
  // 旗指物（背中の旗）
  ch += `<line x1="160" y1="8" x2="160" y2="240" stroke="#5a3d22" stroke-width="4"/>`;
  ch += `<rect x="160" y="10" width="34" height="88" fill="${L.flag}" stroke="${ink}" stroke-width="2"/>`;
  ch += kamonSVG(b.kamon, contrast(L.flag), 177, 36, 13);

  // 胴（小さめにして頭を目立たせる）
  let body = '';
  body += `<path d="M34 240 L46 176 Q100 158 154 176 L166 240 Z" fill="url(#${id}ar)" ${st}/>`;
  for (let y = 188; y < 240; y += 10) body += `<path d="M${44 - (y - 188) * .1} ${y} Q100 ${y - 6} ${156 + (y - 188) * .1} ${y}" fill="none" stroke="${L.lace}" stroke-width="2.4" opacity=".9"/>`;
  body += kamonSVG(b.kamon, '#e8c14a', 100, 208, 13);
  body += `<path d="M22 182 L56 170 L62 222 L26 232 Z" fill="${L.armor}" ${st}/><path d="M178 182 L144 170 L138 222 L174 232 Z" fill="${L.armor}" ${st}/>`;
  for (let i = 0; i < 4; i++) { const y = 186 + i * 11; body += `<path d="M${25 + i} ${y + 2} L${57 + i * .3} ${y - 9}" stroke="${L.lace}" stroke-width="2"/><path d="M${175 - i} ${y + 2} L${143 - i * .3} ${y - 9}" stroke="${L.lace}" stroke-width="2"/>`; }
  ch += `<g transform="translate(100 240) scale(.82) translate(-100 -240)">${body}</g>`;

  // 頭（1.4倍。顔の中心が (100,138) に来る）
  let h = '';
  h += `<path d="M56 110 Q46 142 54 162 L76 152 Q68 132 70 112 Z" fill="${L.helm}" ${st}/><path d="M144 110 Q154 142 146 162 L124 152 Q132 132 130 112 Z" fill="${L.helm}" ${st}/>`;
  h += `<ellipse cx="100" cy="127" rx="31" ry="37" fill="${L.skin}" ${st}/>`;
  h += `<path d="M78 150 Q100 166 122 150" fill="none" stroke="${shade(L.skin, -25)}" stroke-width="2" opacity=".6"/>`;
  // ほっぺ
  h += sk.has('sake')
    ? `<ellipse cx="80" cy="141" rx="8" ry="4.5" fill="#ff3b3b" opacity=".7"/><ellipse cx="120" cy="141" rx="8" ry="4.5" fill="#ff3b3b" opacity=".7"/>`
    : `<ellipse cx="80" cy="141" rx="6" ry="3.5" fill="#ff7a7a" opacity=".35"/><ellipse cx="120" cy="141" rx="6" ry="3.5" fill="#ff7a7a" opacity=".35"/>`;
  // 目と眉（さらに少し大きく）
  const eyeType = sk.has('hirune') ? 'sleepy' : L.eyes;
  const eyes = {
    fierce: `<path d="M77 120 L95 124 L93 130 L79 127 Z M123 120 L105 124 L107 130 L121 127 Z" fill="#fff" ${st} stroke-width="2"/><circle cx="88" cy="126" r="2.8" fill="${ink}"/><circle cx="112" cy="126" r="2.8" fill="${ink}"/><circle cx="89" cy="125" r="1" fill="#fff"/><circle cx="113" cy="125" r="1" fill="#fff"/>`,
    round: `<circle cx="87" cy="125" r="6.5" fill="#fff" ${st} stroke-width="2"/><circle cx="113" cy="125" r="6.5" fill="#fff" ${st} stroke-width="2"/><circle cx="88" cy="126" r="3.2" fill="${ink}"/><circle cx="112" cy="126" r="3.2" fill="${ink}"/><circle cx="89.3" cy="124.6" r="1.3" fill="#fff"/><circle cx="113.3" cy="124.6" r="1.3" fill="#fff"/>`,
    sleepy: `<path d="M79 126 Q87 122 95 126 M105 126 Q113 122 121 126" fill="none" ${st}/><path d="M80 127 Q87 131 94 127 M106 127 Q113 131 120 127" fill="none" stroke="${ink}" stroke-width="1.6"/>`,
    glare: `<path d="M78 124 L96 125 M104 125 L122 124" ${st} stroke-width="3.5"/><circle cx="88" cy="125" r="1.8" fill="#e8432f"/><circle cx="112" cy="125" r="1.8" fill="#e8432f"/>`,
  };
  let e = eyes[eyeType];
  if (L.eyepatch) e += `<path d="M104 118 L124 118 L122 132 L106 132 Z" fill="${ink}"/><path d="M70 112 L130 120" stroke="${ink}" stroke-width="2"/>`;
  const brows = {
    angry: `<path d="M74 113 L96 119 L95 115 L75 108 Z M126 113 L104 119 L105 115 L125 108 Z" fill="${ink}"/>`,
    flat: `<path d="M75 113 L96 113 L96 109 L75 109 Z M125 113 L104 113 L104 109 L125 109 Z" fill="${ink}"/>`,
    sad: `<path d="M75 110 L96 115 L96 111 L76 106 Z M125 110 L104 115 L104 111 L124 106 Z" fill="${ink}" transform="rotate(8 100 112)"/>`,
  };
  e += brows[L.brows];
  h += `<g transform="translate(100 104) scale(1.15) translate(-100 -104)">${e}</g>`;
  if (L.scar) h += `<path d="M80 112 L96 138" stroke="#b23a2b" stroke-width="2.4"/>`;
  // 鼻
  h += `<path d="M100 130 L96 140 L103 140" fill="none" stroke="${ink}" stroke-width="2"/>`;
  // 口・面頬（めんぼお）
  if (L.mask) {
    h += `<path d="M72 138 Q100 132 128 138 L124 160 Q100 172 76 160 Z" fill="#7a1f1f" ${st}/>`;
    h += `<path d="M84 150 L116 150" stroke="#f2f2f2" stroke-width="3"/><path d="M88 146 L88 154 M94 146 L94 154 M100 146 L100 154 M106 146 L106 154 M112 146 L112 154" stroke="${ink}" stroke-width="1.5"/>`;
    h += `<path d="M78 142 Q72 146 76 150 M122 142 Q128 146 124 150" fill="none" stroke="#f2f2f2" stroke-width="2"/>`;
  } else {
    const mouth = {
      grin: `<path d="M86 148 Q100 158 114 148 Q100 153 86 148 Z" fill="#fff" ${st} stroke-width="2"/>`,
      shout: `<ellipse cx="100" cy="151" rx="10" ry="8" fill="#5a1414" ${st} stroke-width="2"/><path d="M92 146 L108 146" stroke="#fff" stroke-width="2.5"/>`,
      frown: `<path d="M88 153 Q100 146 112 153" fill="none" ${st}/>`,
      smirk: `<path d="M88 151 Q102 152 113 145" fill="none" ${st}/>`,
    };
    h += mouth[L.mouth];
    const beard = {
      none: '',
      mustache: `<path d="M84 145 Q92 139 100 143 Q108 139 116 145 Q108 143 100 147 Q92 143 84 145 Z" fill="${ink}"/>`,
      full: `<path d="M70 132 Q72 166 100 170 Q128 166 130 132 Q124 152 112 156 Q100 162 88 156 Q76 152 70 132 Z" fill="${ink}"/><path d="M84 145 Q100 139 116 145" stroke="${ink}" stroke-width="4" fill="none"/>`,
      goatee: `<path d="M94 158 Q100 172 106 158 Z" fill="${ink}"/><path d="M86 145 Q100 140 114 145" stroke="${ink}" stroke-width="3" fill="none"/>`,
    };
    h += beard[L.beard];
  }
  // 兜
  h += `<path d="M60 112 Q100 50 140 112 Q100 100 60 112 Z" fill="url(#${id}hm)" ${st}/>`;
  for (let i = 1; i < 8; i++) { const x = 60 + i * 10; h += `<path d="M${x} ${110 - Math.sin(i / 8 * Math.PI) * 12} Q${100 + (x - 100) * .3} ${72} 100 64" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.4"/>`; }
  h += `<path d="M58 112 Q100 102 142 112 L142 118 Q100 108 58 118 Z" fill="${shade(L.helm, 25)}" ${st} stroke-width="2"/>`;
  h += `<path d="M60 112 L40 102 L46 126 L64 118 Z" fill="${L.helm}" ${st}/><path d="M140 112 L160 102 L154 126 L136 118 Z" fill="${L.helm}" ${st}/>`;
  h += kamonSVG(b.kamon, L.crestColor, 51, 114, 6.5);
  h += kamonSVG(b.kamon, L.crestColor, 149, 114, 6.5);
  ch += `<g transform="translate(100 138) scale(1.4) translate(-100 -127)">${h}</g>`;

  // 前立て（兜の飾り）。頭ほどは大きくしない
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
  ch += `<g transform="translate(100 80) scale(1.1) translate(-100 -84)">${crest[L.crest]}</g>`;

  // ===== スキルの小物（ツッコミどころ） =====
  if (sk.has('nekozuki')) { // 兜の上に猫
    const cat = '#f2a33a';
    ch += `<path d="M162 100 Q180 96 174 78" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/><path d="M162 100 Q180 96 174 78" fill="none" stroke="${cat}" stroke-width="4.5" stroke-linecap="round"/>`;
    ch += `<ellipse cx="149" cy="98" rx="17" ry="11" fill="${cat}" ${st}/><path d="M145 89 L147 95 M152 88 L153 94 M158 90 L158 96" stroke="#c4761a" stroke-width="2.2"/>`;
    ch += `<path d="M125 82 L126 69 L134 76 Z M136 76 L144 69 L144 82 Z" fill="${cat}" ${st} stroke-width="2"/>`;
    ch += `<circle cx="134" cy="86" r="11" fill="${cat}" ${st}/>`;
    ch += `<path d="M128 86 Q130 83 132 86 M136 86 Q138 83 140 86" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M132 90 Q134 92.5 134 90 Q134 92.5 136 90" fill="none" stroke="${ink}" stroke-width="1.4"/>`;
    ch += `<ellipse cx="128" cy="90" rx="2.6" ry="1.5" fill="#ff7a7a" opacity=".7"/><ellipse cx="140" cy="90" rx="2.6" ry="1.5" fill="#ff7a7a" opacity=".7"/>`;
  }
  if (sk.has('harapeko')) { // おにぎり＋よだれ＋ぐぅ〜
    ch += `<g transform="rotate(-12 48 206)"><path d="M48 184 Q53 184 66 210 Q69 220 60 220 L36 220 Q27 220 30 210 Q43 184 48 184 Z" fill="#fff" ${st}/><rect x="38" y="207" width="20" height="13" fill="#1f2a1f" stroke="${ink}" stroke-width="2"/><circle cx="44" cy="198" r="1.4" fill="#c9c9c9"/><circle cx="52" cy="194" r="1.4" fill="#c9c9c9"/></g>`;
    ch += `<path d="M117 167 Q122 177 117 180 Q112 177 117 167 Z" fill="#8cd3ff" stroke="${ink}" stroke-width="1.5"/>`;
    ch += txt(150, 234, 17, 'ぐぅ〜');
  }
  if (sk.has('sake')) { // 徳利
    ch += `<g transform="rotate(12 160 206)"><path d="M154 182 L166 182 L164 191 Q177 201 175 217 Q173 226 160 226 Q147 226 145 217 Q143 201 156 191 Z" fill="#f4f1e8" ${st}/><path d="M149 204 Q160 209 171 204" stroke="#2f5fae" stroke-width="3" fill="none"/>${txt(160, 221, 12, '酒', '#2f5fae', 'stroke="#f4f1e8"')}</g>`;
    ch += txt(34, 66, 15, 'ヒック', '#ffd36b');
  }
  if (sk.has('hirune')) { // 鼻ちょうちん＋Zz
    ch += `<circle cx="117" cy="158" r="11" fill="#bfe6ff" fill-opacity=".8" stroke="#5aa9d6" stroke-width="2"/><circle cx="113" cy="154" r="2.6" fill="#fff"/>`;
    ch += txt(26, 70, 26, 'Z', '#bfe6ff') + txt(44, 46, 17, 'z', '#bfe6ff');
  }
  if (sk.has('houkou')) { // 逆さの地図＋？
    ch += `<g transform="rotate(-14 44 208)"><rect x="24" y="192" width="42" height="30" fill="#e9d9a8" ${st}/><path d="M30 215 Q38 200 46 210 T60 198" stroke="#b23a2b" stroke-dasharray="3 3" fill="none" stroke-width="2"/><path d="M55 196 L61 202 M61 196 L55 202" stroke="#b23a2b" stroke-width="2"/></g>`;
    ch += txt(26, 72, 30, '?', '#ffd36b') + txt(46, 44, 20, '?', '#ffd36b');
  }
  if (sk.has('chanoyu')) { // 抹茶
    ch += `<path d="M42 196 Q38 188 42 182 Q46 176 42 170 M54 196 Q50 188 54 182" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    ch += `<path d="M27 202 L69 202 Q67 225 48 225 Q29 225 27 202 Z" fill="#4a3b30" ${st}/><ellipse cx="48" cy="202" rx="21" ry="4" fill="#7cb342" stroke="${ink}" stroke-width="2"/>`;
  }
  s += `<g filter="url(#${id}st)">${ch}</g>`;

  // ===== レア演出 =====
  if (holo) {
    s += `<rect width="200" height="240" fill="url(#${id}ho)" opacity=".32" style="mix-blend-mode:overlay"/>`;
    s += `<rect x="-200" y="0" width="200" height="240" fill="url(#${id}sh)"><animate attributeName="x" values="-200;200;200" keyTimes="0;.45;1" dur="3.5s" repeatCount="indefinite"/></rect>`;
  }
  if (rare) {
    const spark = (x, y, r, f) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="${f}"/>`;
    const sp = [[22, 26, 9], [186, 124, 7], [18, 156, 6], [70, 14, 5]];
    if (holo) sp.push([140, 18, 6], [184, 196, 8], [16, 108, 5]);
    s += sp.map(([x, y, r], i) => spark(x, y, r, i % 2 ? '#ffe08a' : '#fff')).join('');
  }
  if (rid === 'den') s += `<rect width="200" height="240" fill="none" stroke="#ffd36b" stroke-width="6"/>`;
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
