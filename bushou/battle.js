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
