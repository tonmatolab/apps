// 自動生成ファイル：tools/sync-bushou-core.sh で bushou/gen.js と bushou/battle.js から作る。直接編集しないこと
// ===== 名前 → 戦国武将（同じ名前からは必ず同じ武将が生まれる） =====
'use strict';

const STAT_KEYS = ['bu', 'tou', 'chi', 'sei', 'un'];
const STAT_NAMES = { bu: '武力', tou: '統率', chi: '知略', sei: '政治', un: '運' };

const RARITIES = [
  { id: 'nami', name: '並', p: 0.55, total: [200, 260], color: '#8a93a3', glow: '#c9d1dc' },
  { id: 'ryo', name: '良将', p: 0.30, total: [260, 310], color: '#2f7de1', glow: '#8cc0ff' },
  { id: 'mei', name: '名将', p: 0.12, total: [310, 360], color: '#8b4fe0', glow: '#c9a5ff' },
  { id: 'ten', name: '天下人', p: 0.028, total: [360, 410], color: '#e0a100', glow: '#ffe08a' },
  { id: 'den', name: '伝説', p: 0.002, total: [420, 470], color: '#e8432f', glow: '#ffb3a6' },
];

const TROOPS = [
  { id: 'kiba', name: '騎馬', icon: '🐎' },
  { id: 'teppo', name: '鉄砲', icon: '🔫' },
  { id: 'ashigaru', name: '足軽', icon: '🗡️' },
  { id: 'yumi', name: '弓', icon: '🏹' },
  { id: 'shinobi', name: '忍', icon: '🥷' },
];
// 相性：左が右に強い（騎馬→弓→足軽→鉄砲→騎馬。忍は誰にも有利不利なし・回避が高い）
const BEATS = { kiba: 'yumi', yumi: 'ashigaru', ashigaru: 'teppo', teppo: 'kiba' };

// 固有スキル
const SKILLS = [
  { id: 'sandan', name: '三段構え', desc: '確率で2回攻撃する', kind: 'good' },
  { id: 'haisui', name: '背水の陣', desc: '兵が4割を切ると攻撃力1.8倍', kind: 'good' },
  { id: 'utsuke', name: 'うつけの奇策', desc: 'まれに一発逆転の大打撃', kind: 'good' },
  { id: 'shippu', name: '疾風怒濤', desc: '1戦目の攻撃力1.5倍', kind: 'good' },
  { id: 'teppeki', name: '鉄壁', desc: '確率で受けるダメージ半減', kind: 'good' },
  { id: 'kakei', name: '火計', desc: '確率で敵兵を焼き払う', kind: 'good' },
  { id: 'chouryaku', name: '調略', desc: '確率で敵の攻撃力を下げる', kind: 'good' },
  { id: 'hyourou', name: '兵糧攻め', desc: '毎戦、敵兵がじわじわ減る', kind: 'good' },
  { id: 'ichiban', name: '一番槍', desc: '開戦直後に先制攻撃', kind: 'good' },
  { id: 'kagemusha', name: '影武者', desc: '一度だけ敗北を回避する', kind: 'good' },
  { id: 'oni', name: '鬼の形相', desc: '開戦時、敵の統率を下げる', kind: 'good' },
  { id: 'yashu', name: '夜襲', desc: '確率で会心の一撃', kind: 'good' },
  { id: 'saihai', name: '名采配', desc: '常に攻撃力1.15倍', kind: 'good' },
  { id: 'taiko', name: '鼓舞の太鼓', desc: '2戦目に兵を回復', kind: 'good' },
  { id: 'otoshiana', name: '落とし穴', desc: '騎馬の敵の攻撃を封じる', kind: 'good' },
  { id: 'nanban', name: '南蛮渡来', desc: '鉄砲なら攻撃力1.3倍', kind: 'good' },
  { id: 'nitou', name: '二刀流', desc: '確率で追撃する', kind: 'good' },
  { id: 'chanoyu', name: '茶の湯', desc: '3戦目の前に兵を回復', kind: 'good' },
  { id: 'shinsoku', name: '神速', desc: '確率で敵の攻撃を回避', kind: 'good' },
  { id: 'harapeko', name: '腹ペコ', desc: '空腹で攻撃力0.85倍（残念）', kind: 'bad' },
  { id: 'houkou', name: '方向音痴', desc: 'たまに攻撃が空振り（残念）', kind: 'bad' },
  { id: 'hirune', name: '昼寝', desc: '1戦目は寝ているが3戦目は2倍', kind: 'odd' },
  { id: 'sake', name: '酒豪', desc: '飲むと強いが守りが甘い', kind: 'odd' },
  { id: 'nekozuki', name: '猫好き', desc: 'まれに猫に気を取られる…が猫が助けることも', kind: 'odd' },
];

const NICK_PRE = ['雷鳴の', '月下の', '紅蓮の', '疾風の', '漆黒の', '黄金の', '不死身の', '無双の', '鬼神の', '千年に一度の',
  '腹ペコの', '寝坊助の', '方向音痴の', '酒豪の', '二日酔いの', '泣き虫の', '猫好きの', '遅刻魔の', '筋肉の', '甘党の',
  '蒼天の', '白銀の', '炎の', '氷の', '風来の'];
const NICK_CORE = ['鬼武者', '軍師', '槍使い', '鉄砲名人', '忍び', '荒武者', '若武者', '猛将', '知将', '弓取り',
  '姫武者', '侍大将', '足軽頭', '傾奇者', '剣豪', '覇王', '名君', '策士'];
const COOL_PRE = ['雷鳴の', '月下の', '紅蓮の', '漆黒の', '黄金の', '不死身の', '無双の', '鬼神の', '千年に一度の', '蒼天の', '白銀の'];

// 隠し武将（歴史上の名前など）
const SPECIAL = {
  'おだのぶなが': { rarity: 'den', nick: '第六天魔王', skills: ['sandan', 'utsuke'], troop: 'teppo' },
  '織田信長': { rarity: 'den', nick: '第六天魔王', skills: ['sandan', 'utsuke'], troop: 'teppo' },
  'とよとみひでよし': { rarity: 'den', nick: '天下人', skills: ['chouryaku', 'taiko'], troop: 'ashigaru' },
  '豊臣秀吉': { rarity: 'den', nick: '天下人', skills: ['chouryaku', 'taiko'], troop: 'ashigaru' },
  'とくがわいえやす': { rarity: 'den', nick: '泰平の礎', skills: ['teppeki', 'hyourou'], troop: 'ashigaru' },
  '徳川家康': { rarity: 'den', nick: '泰平の礎', skills: ['teppeki', 'hyourou'], troop: 'ashigaru' },
  'たけだしんげん': { rarity: 'den', nick: '甲斐の虎', skills: ['shippu', 'saihai'], troop: 'kiba' },
  '武田信玄': { rarity: 'den', nick: '甲斐の虎', skills: ['shippu', 'saihai'], troop: 'kiba' },
  'うえすぎけんしん': { rarity: 'den', nick: '越後の龍', skills: ['yashu', 'kagemusha'], troop: 'kiba' },
  '上杉謙信': { rarity: 'den', nick: '越後の龍', skills: ['yashu', 'kagemusha'], troop: 'kiba' },
  'だてまさむね': { rarity: 'den', nick: '独眼竜', skills: ['nanban', 'nitou'], troop: 'teppo' },
  '伊達政宗': { rarity: 'den', nick: '独眼竜', skills: ['nanban', 'nitou'], troop: 'teppo' },
  'さなだゆきむら': { rarity: 'den', nick: '日本一の兵', skills: ['haisui', 'ichiban'], troop: 'kiba' },
  '真田幸村': { rarity: 'den', nick: '日本一の兵', skills: ['haisui', 'ichiban'], troop: 'kiba' },
  'あけちみつひで': { rarity: 'den', nick: '本能寺の主', skills: ['kakei', 'chouryaku'], troop: 'teppo' },
  '明智光秀': { rarity: 'den', nick: '本能寺の主', skills: ['kakei', 'chouryaku'], troop: 'teppo' },
  'とんまと': { rarity: 'den', nick: '赤き果実の忍び', skills: ['utsuke', 'nekozuki'], troop: 'shinobi' },
};

function normName(s) {
  s = String(s || '').normalize('NFKC').trim().replace(/\s+/g, '');
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return s.toLowerCase();
}
function displayName(s) { return [...String(s || '').normalize('NFKC').trim().replace(/\s+/g, ' ')].slice(0, 12).join(''); }

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function seeded(str) { const s = cyrb128(str); const R = sfc32(s[0], s[1], s[2], s[3]); for (let i = 0; i < 12; i++) R(); return R; }
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const between = (R, a, b) => a + Math.floor(R() * (b - a + 1));

function makeBushou(rawName) {
  const name = displayName(rawName);
  const key = normName(rawName);
  const R = seeded('bushou:' + key);
  const sp = SPECIAL[key] || SPECIAL[name];

  // レア度
  let rarity;
  if (sp) rarity = RARITIES.find((r) => r.id === sp.rarity);
  else {
    let x = R(), acc = 0;
    rarity = RARITIES[0];
    for (const r of [...RARITIES].reverse()) { acc += r.p; if (x < acc) { rarity = r; break; } }
  }

  // 能力値：合計をレア度で決め、5つに配分
  const total = between(R, rarity.total[0], rarity.total[1]);
  const w = STAT_KEYS.map(() => 0.35 + R() * R() * 1.8);
  const ws = w.reduce((a, b) => a + b, 0);
  const stats = {};
  STAT_KEYS.forEach((k, i) => { stats[k] = Math.max(8, Math.min(100, Math.round(total * w[i] / ws))); });
  // 100で頭打ちになった分は、ほかの能力に配り直す
  for (let guard = 0; guard < 20; guard++) {
    const sum = STAT_KEYS.reduce((a, k) => a + stats[k], 0), open = STAT_KEYS.filter((k) => stats[k] < 100);
    if (sum >= total || !open.length) break;
    const add = Math.ceil((total - sum) / open.length);
    open.forEach((k) => { stats[k] = Math.min(100, stats[k] + add); });
  }

  const troop = sp ? TROOPS.find((t) => t.id === sp.troop) : pick(R, TROOPS);
  // スキル：名将以上は2つ
  const nSkill = ['mei', 'ten', 'den'].includes(rarity.id) ? 2 : 1;
  let skills = [];
  if (sp) skills = sp.skills.map((id) => SKILLS.find((s) => s.id === id));
  else {
    const pool = SKILLS.filter((s) => rarity.id === 'nami' || s.kind !== 'bad');
    while (skills.length < nSkill) { const s = pick(R, pool); if (!skills.includes(s)) skills.push(s); }
  }
  const pre = sp ? '' : (['ten', 'den'].includes(rarity.id) ? pick(R, COOL_PRE) : pick(R, NICK_PRE));
  const nick = sp ? sp.nick : pre + pick(R, NICK_CORE);
  const power = Math.round(stats.bu * 1.3 + stats.tou * 1.2 + stats.chi * 1.0 + stats.sei * .6 + stats.un * .9);

  // 見た目
  const look = {
    skin: pick(R, ['#f2c9a0', '#e9b48a', '#d9a077', '#f6d2b0', '#c98d63']),
    armor: pick(R, ['#2b2f3a', '#7a1f1f', '#1f3b6b', '#2e4a2b', '#4a2a5c', '#5a4a2a', '#1d1d1d', '#8a6a1a']),
    lace: pick(R, ['#e8432f', '#2f7de1', '#e0a100', '#ffffff', '#3cb371', '#8b4fe0', '#ff8ab0']),
    helm: pick(R, ['#1d1d1d', '#3a3f4b', '#7a1f1f', '#2b3a5c', '#5c4a2a']),
    crest: pick(R, ['kuwagata', 'mikazuki', 'nichirin', 'usagi', 'shika', 'honoo', 'hoshi', 'kamon']),
    crestColor: pick(R, ['#e8c14a', '#d9d9d9', '#e8432f', '#e8c14a', '#f2f2f2']),
    eyes: pick(R, ['fierce', 'round', 'sleepy', 'glare', 'fierce']),
    brows: pick(R, ['angry', 'flat', 'sad', 'angry']),
    mouth: pick(R, ['grin', 'shout', 'frown', 'smirk', 'frown']),
    beard: pick(R, ['none', 'mustache', 'full', 'goatee', 'mustache']),
    mask: R() < .18,
    scar: R() < .2,
    eyepatch: key.includes('まさむね') || key.includes('政宗') || R() < .04,
    flag: pick(R, ['#e8432f', '#2f7de1', '#f2f2f2', '#1d1d1d', '#e0a100', '#3cb371', '#8b4fe0']),
  };
  // 家紋
  const kamon = {
    n: pick(R, [3, 4, 5, 5, 6, 8]),
    shape: pick(R, ['circle', 'leaf', 'diamond', 'wedge', 'drop']),
    ring: R() < .6,
    inner: pick(R, ['dot', 'ring', 'petals', 'none']),
    rot: R() < .5 ? 0 : 1,
  };
  return { name, key, rarity, stats, total, power, troop, skills, nick, look, kamon, special: !!sp };
}

if (typeof module !== 'undefined') module.exports = { makeBushou, normName, seeded, SKILLS, TROOPS, BEATS, RARITIES, STAT_KEYS, STAT_NAMES };

// ===== 合戦の計算（能力が勝敗の大部分を決め、少しだけ運が絡む） =====
'use strict';

function simulateBattle(A, B, rand = Math.random) {
  const has = (b, id) => b.skills.some((s) => s.id === id);
  const sk = (b, id) => b.skills.find((s) => s.id === id);
  const side = (b) => ({
    b, max: 1500 + b.stats.tou * 12, troops: 1500 + b.stats.tou * 12,
    tou: b.stats.tou, atkMul: 1, defMul: 1, kage: has(b, 'kagemusha'), haisuiUsed: false,
  });
  const P = [side(A), side(B)];
  const ev = [];
  const say = (text, extra = {}) => ev.push({ type: 'say', text, ...extra });
  const cut = (i, skill, text) => ev.push({ type: 'cut', side: i, skill: skill.name, text });
  const chance = (b, base) => rand() < base + b.stats.chi / 500 + b.stats.un / 1000;

  say(`${A.name}軍 ${P[0].troops}人、${B.name}軍 ${P[1].troops}人。両軍、布陣！`);

  // 開戦時のスキル
  for (const i of [0, 1]) {
    const me = P[i], foe = P[1 - i];
    if (has(me.b, 'oni')) { foe.tou = Math.max(5, foe.tou - 15); cut(i, sk(me.b, 'oni'), `${me.b.name}の鬼の形相に、${foe.b.name}軍がおののく！`); }
    if (has(me.b, 'harapeko')) { me.atkMul *= .85; cut(i, sk(me.b, 'harapeko'), `${me.b.name}「…腹が減っては戦ができぬ」攻撃力ダウン！`); }
    if (has(me.b, 'sake')) { me.atkMul *= 1.25; me.defMul *= 1.2; cut(i, sk(me.b, 'sake'), `${me.b.name}、景気づけに一杯！ 攻めは強いが守りが甘くなった`); }
    if (has(me.b, 'saihai')) me.atkMul *= 1.15;
    if (has(me.b, 'nanban') && me.b.troop.id === 'teppo') me.atkMul *= 1.3;
  }
  for (const i of [0, 1]) {
    const me = P[i], foe = P[1 - i];
    if (has(me.b, 'ichiban')) {
      const d = Math.round(foe.max * .1);
      foe.troops -= d;
      cut(i, sk(me.b, 'ichiban'), `一番槍！ ${me.b.name}軍が先陣を切った！`);
      ev.push({ type: 'hit', side: 1 - i, dmg: d, troops: [P[0].troops, P[1].troops] });
    }
  }

  const speed = (p) => (p.b.troop.id === 'kiba' || p.b.troop.id === 'shinobi' ? 20 : 0) + p.b.stats.bu * .2 + p.b.stats.un * .1 + (has(p.b, 'shinsoku') ? 30 : 0);
  const winner = () => (P[0].troops <= 0 ? 1 : P[1].troops <= 0 ? 0 : -1);

  for (let round = 1; round <= 3; round++) {
    ev.push({ type: 'round', round });
    // ラウンド前のスキル
    for (const i of [0, 1]) {
      const me = P[i];
      if (round === 2 && has(me.b, 'taiko')) { const h = Math.round(me.max * .15); me.troops = Math.min(me.max, me.troops + h); cut(i, sk(me.b, 'taiko'), `ドンドン！ 鼓舞の太鼓で${me.b.name}軍が${h}人持ち直した！`); ev.push({ type: 'heal', side: i, troops: [P[0].troops, P[1].troops] }); }
      if (round === 3 && has(me.b, 'chanoyu')) { const h = Math.round(me.max * .2); me.troops = Math.min(me.max, me.troops + h); cut(i, sk(me.b, 'chanoyu'), `一服の茶で心を整えた。${me.b.name}軍、${h}人回復！`); ev.push({ type: 'heal', side: i, troops: [P[0].troops, P[1].troops] }); }
      if (round > 1) { const h = Math.round(me.b.stats.sei * 2); me.troops = Math.min(me.max, me.troops + h); }
    }
    ev.push({ type: 'charge', round });
    const order = speed(P[0]) + rand() * 25 >= speed(P[1]) + rand() * 25 ? [0, 1] : [1, 0];
    for (const i of order) {
      const me = P[i], foe = P[1 - i];
      if (me.troops <= 0 || foe.troops <= 0) continue;
      let mul = me.atkMul;
      const notes = [];
      if (round === 1 && has(me.b, 'hirune')) { cut(i, sk(me.b, 'hirune'), `${me.b.name}、まさかの昼寝中…！ 攻撃せず`); continue; }
      if (round === 3 && has(me.b, 'hirune')) { mul *= 2; cut(i, sk(me.b, 'hirune'), `よく寝た！ ${me.b.name}、本気を出す！`); }
      if (round === 1 && has(me.b, 'shippu')) { mul *= 1.5; cut(i, sk(me.b, 'shippu'), `疾風怒濤！ ${me.b.name}軍が一気に駆ける！`); }
      if (has(me.b, 'haisui') && !me.haisuiUsed && me.troops < me.max * .4) { me.haisuiUsed = true; mul *= 1.8; cut(i, sk(me.b, 'haisui'), `背水の陣！ 追い詰められた${me.b.name}が覚醒する！`); }
      if (has(me.b, 'houkou') && rand() < .2) { cut(i, sk(me.b, 'houkou'), `${me.b.name}軍、道に迷って敵がいない方向へ突撃…！`); continue; }
      if (has(me.b, 'nekozuki') && rand() < .2) {
        if (rand() < .5) { cut(i, sk(me.b, 'nekozuki'), `${me.b.name}、野良猫に見とれて攻撃を忘れた…`); continue; }
        mul *= 1.6; cut(i, sk(me.b, 'nekozuki'), `猫の大群が${me.b.name}に加勢した！ にゃー！`);
      }
      if (has(foe.b, 'otoshiana') && me.b.troop.id === 'kiba') { mul *= .4; cut(1 - i, sk(foe.b, 'otoshiana'), `落とし穴！ ${me.b.name}の騎馬隊が次々と落ちていく！`); }
      if (has(foe.b, 'chouryaku') && chance(foe.b, .12)) { mul *= .6; cut(1 - i, sk(foe.b, 'chouryaku'), `調略成功！ ${me.b.name}軍の一部が寝返った！`); }
      // 相性
      let aff = 1;
      if (BEATS[me.b.troop.id] === foe.b.troop.id) { aff = 1.2; notes.push('相性◎'); }
      else if (BEATS[foe.b.troop.id] === me.b.troop.id) { aff = .85; notes.push('相性×'); }
      // 基本の攻撃力
      const base = (me.b.stats.bu * 5 + me.tou * 3) * (1.15 + round * .12);
      const luck = .7 + rand() * .6 + (me.b.stats.un - 50) / 800;
      let dmg = base * mul * aff * luck * foe.defMul;
      if (has(foe.b, 'shinsoku') && rand() < .15) { cut(1 - i, sk(foe.b, 'shinsoku'), `神速！ ${foe.b.name}が攻撃をかわした！`); dmg = 0; }
      if (has(foe.b, 'teppeki') && dmg > 0 && chance(foe.b, .22)) { dmg *= .5; cut(1 - i, sk(foe.b, 'teppeki'), `鉄壁の守り！ ${foe.b.name}軍、被害を半分に抑えた！`); }
      if (has(me.b, 'yashu') && dmg > 0 && chance(me.b, .18)) { dmg *= 1.6; cut(i, sk(me.b, 'yashu'), `夜襲！ 闇にまぎれた会心の一撃！`); }
      if (dmg > 0 && rand() < me.b.stats.un / 900) { dmg *= 1.3; notes.push('会心'); }
      dmg = Math.round(dmg);
      if (dmg > 0) {
        foe.troops -= dmg;
        say(attackLine(me.b, foe.b, dmg, notes));
        ev.push({ type: 'hit', side: 1 - i, dmg, notes, troops: [P[0].troops, P[1].troops] });
      }
      // 追加攻撃
      if (has(me.b, 'sandan') && foe.troops > 0 && chance(me.b, .2)) { const d = Math.round(dmg * .6); foe.troops -= d; cut(i, sk(me.b, 'sandan'), `三段構え！ 鉄砲の一斉射撃が止まらない！`); ev.push({ type: 'hit', side: 1 - i, dmg: d, troops: [P[0].troops, P[1].troops] }); }
      if (has(me.b, 'nitou') && foe.troops > 0 && chance(me.b, .2)) { const d = Math.round(dmg * .5); foe.troops -= d; cut(i, sk(me.b, 'nitou'), `二刀流の追撃！`); ev.push({ type: 'hit', side: 1 - i, dmg: d, troops: [P[0].troops, P[1].troops] }); }
      if (has(me.b, 'kakei') && foe.troops > 0 && chance(me.b, .15)) { const d = Math.round(foe.max * .12); foe.troops -= d; cut(i, sk(me.b, 'kakei'), `火計！ ${foe.b.name}の陣が炎に包まれた！`); ev.push({ type: 'hit', side: 1 - i, dmg: d, fire: true, troops: [P[0].troops, P[1].troops] }); }
      if (has(me.b, 'utsuke') && foe.troops > 0 && rand() < .07 + me.b.stats.un / 2000) { const d = Math.round(foe.max * .35); foe.troops -= d; cut(i, sk(me.b, 'utsuke'), `うつけの奇策！ 誰も予想しなかった一手で戦局がひっくり返る！`); ev.push({ type: 'hit', side: 1 - i, dmg: d, troops: [P[0].troops, P[1].troops] }); }
      // 影武者
      if (foe.troops <= 0 && foe.kage) { foe.kage = false; foe.troops = Math.round(foe.max * .1); cut(1 - i, sk(foe.b, 'kagemusha'), `討ち取ったのは…影武者だった！ ${foe.b.name}は生きている！`); ev.push({ type: 'heal', side: 1 - i, troops: [P[0].troops, P[1].troops] }); }
    }
    // 兵糧攻め
    for (const i of [0, 1]) {
      const me = P[i], foe = P[1 - i];
      if (has(me.b, 'hyourou') && foe.troops > 0 && me.troops > 0) { const d = Math.round(foe.max * .05); foe.troops -= d; say(`兵糧攻めで${foe.b.name}軍の兵が${d}人逃げ出した…`); ev.push({ type: 'hit', side: 1 - i, dmg: d, troops: [P[0].troops, P[1].troops] }); }
    }
    P.forEach((p) => { p.troops = Math.max(0, p.troops); });
    ev.push({ type: 'roundEnd', round, troops: [P[0].troops, P[1].troops] });
    if (winner() >= 0) break;
  }
  let win = winner();
  let reason = 'rout';
  if (win < 0) {
    const r0 = P[0].troops / P[0].max, r1 = P[1].troops / P[1].max;
    win = r0 === r1 ? (rand() < .5 ? 0 : 1) : r0 > r1 ? 0 : 1;
    reason = 'judge';
  }
  ev.push({ type: 'end', winner: win, reason, troops: [P[0].troops, P[1].troops], max: [P[0].max, P[1].max] });
  return { events: ev, winner: win, reason, max: [P[0].max, P[1].max], troops: [P[0].troops, P[1].troops] };
}

function attackLine(me, foe, dmg, notes) {
  const t = me.troop.id;
  const verb = { kiba: '騎馬隊が突撃', teppo: '鉄砲隊が一斉射撃', ashigaru: '足軽隊が槍ぶすま', yumi: '弓隊が矢の雨', shinobi: '忍び衆が奇襲' }[t];
  const extra = notes.includes('会心') ? '会心の一撃！' : notes.includes('相性◎') ? '相性がいい！' : notes.includes('相性×') ? '相性が悪いが' : '';
  return `${me.name}の${verb}！ ${extra}${foe.name}軍に${dmg}の損害！`;
}

// 敗者のひとこと
const ROUT_LINES = [
  '「今日のところはこのくらいにしてやる！」と言い残して逃げた',
  '馬を置いて走って逃げた',
  '「腹が痛い」と言って帰った',
  '気づいたら城に帰ってお茶を飲んでいた',
  '家臣に担がれて撤退した',
  '「次は本気出す」とつぶやいた',
  '泣きながら和睦を申し込んだ',
];

if (typeof module !== 'undefined') module.exports = { simulateBattle };

export { makeBushou, normName, seeded, simulateBattle, RARITIES };
