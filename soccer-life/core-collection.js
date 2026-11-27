// ===== サッカー人生：称号図鑑と実績 =====
// 引退した選手の称号の判定と、端末に残るコレクション（称号・実績）。
// core.js のあとに読み込む。core.js の内部の部品（SL._）を使い、作ったものを SL に足す。
'use strict';
(function (SL) {
  const { newRecords, challengeCleared } = SL._;
  // ===== 称号図鑑（1回の人生で条件を満たしたものすべてが手に入る） =====
  // [id, 称号, ひとこと, 取り方のヒント, 条件]
  const WC_ORDER = ['グループリーグ敗退', 'ベスト16', 'ベスト8', 'ベスト4', '準優勝', '優勝'];
  function titleContext(s, sum) {
    const aw = s.awards.concat(s.trophies), h = s.history, T = s.totals;
    const cnt = (w) => aw.filter((a) => a.includes(w)).length;
    let stay = 0, best = 0, prev = null;
    for (const r of h) { stay = r.clubId === prev ? stay + 1 : 1; prev = r.clubId; best = Math.max(best, stay); }
    const rv = s.rival;
    return {
      pos: s.p.pos, T, seasons: h.length, age: s.p.age, caps: s.caps, natGoals: s.natGoals,
      wc: s.wc.length, wcWins: s.wc.filter((w) => w.reached === '優勝').length, wcBest: Math.max(-1, ...s.wc.map((w) => WC_ORDER.indexOf(w.reached))), wcGoals: s.wc.reduce((a, w) => a + w.goals, 0),
      lgTitle: cnt('リーグ優勝'), scorer: aw.filter((a) => a.includes('得点王') && !a.includes('ワールドカップ')).length, wcScorer: cnt('ワールドカップ得点王'),
      assistK: cnt('アシスト王'), mvp: cnt('MVP'), b11: cnt('ベストイレブン'), rookie: cnt('新人王'), world: cnt('世界年間'), promo: cnt('昇格'), euTitle: cnt('欧州リーグ優勝'),
      cup: cnt('カップ優勝'), cupL2: cnt('カップ優勝（2部から）'),
      eu: h.filter((x) => SL.isEuShort(x.lg)).length, only2: h.length > 0 && h.every((x) => x.lg === '2部'), clubs: new Set(h.map((x) => x.clubId)).size, maxStay: best,
      leaguesScored: new Set(h.filter((x) => x.goals > 0).map((x) => x.lg)).size, peakOvr: Math.max(0, ...h.map((x) => x.ovr)),
      nums: new Set(h.map((x) => x.number)), married: s.p.married, kids: s.p.kids, logc: (k) => s.log.filter((l) => l.k === k).length,
      hats: (s.family && s.family.hats) || 0, combo: (s.family && s.family.combo) || 0, joint: (s.family && s.family.jointApps) || 0,
      rv: rv ? { w: rv.h2h.w, d: rv.h2h.d, l: rv.h2h.l, n: rv.h2h.w + rv.h2h.d + rv.h2h.l, goals: rv.totals.goals, apps: rv.totals.apps } : null,
      last: s.lastMatch, gen: s.gen, earned: sum.earned, score: sum.score, mode: s.mode, R: s.records || newRecords(),
      potKnown: s.p.potLo === s.p.potHi, pot: s.p.pot, grow: s.p.grow, house: s.p.house, edu: s.p.edu || 0, donated: s.p.donated || 0,
      ch: s.challenge && challengeCleared(s, sum.score) ? s.challenge : null, star: !!s.p.star, awake: !!s.p.awake,
    };
  }
  const ACE = { FW: 9, MF: 10, DF: 4, GK: 1 };
  const TITLES = [
    ['g1', '初ゴール', 'あの1点から、すべてが始まった。', 'プロで1点決める', (c) => c.T.goals >= 1],
    ['g50', '点取り屋', 'ゴール前で最も頼れる存在。', '通算50得点', (c) => c.T.goals >= 50],
    ['g100', '百発の主', '大台の100ゴール。', '通算100得点', (c) => c.T.goals >= 100],
    ['g150', 'ゴールハンター', '獲物は逃さない。', '通算150得点', (c) => c.T.goals >= 150],
    ['g200', 'ゴールマシン', '点を取るのが仕事だった。', '通算200得点', (c) => c.T.goals >= 200],
    ['g250', '得点の神様', 'その足は神に愛された。', '通算250得点', (c) => c.T.goals >= 250],
    ['g300', '前人未到', '誰も届かなかった300点。', '通算300得点', (c) => c.T.goals >= 300],
    ['a30', 'アシスト職人', '主役を輝かせる名脇役。', '通算30アシスト', (c) => c.T.assists >= 30],
    ['a60', 'チャンスメーカー', 'チャンスはいつもその足から。', '通算60アシスト', (c) => c.T.assists >= 60],
    ['a100', '司令塔', 'ピッチのすべてが見えていた。', '通算100アシスト', (c) => c.T.assists >= 100],
    ['a150', '魔法の足', 'そのパスは魔法だった。', '通算150アシスト', (c) => c.T.assists >= 150],
    ['p50', 'プロの壁を越えて', '50試合。もう新人ではない。', '通算50試合出場', (c) => c.T.apps >= 50],
    ['p100', '百戦錬磨', '100の試合が、選手を作った。', '通算100試合出場', (c) => c.T.apps >= 100],
    ['p200', '主力の証', '200試合、チームの中心にいた。', '通算200試合出場', (c) => c.T.apps >= 200],
    ['p300', '鉄の体', 'ケガに負けず300試合。', '通算300試合出場', (c) => c.T.apps >= 300],
    ['p400', '不屈', '400試合。積み重ねは裏切らない。', '通算400試合出場', (c) => c.T.apps >= 400],
    ['p500', '永遠の現役', '500試合のピッチに立った。', '通算500試合出場', (c) => c.T.apps >= 500],
    ['cs30', '堅守', 'ゴールを守り抜いた30試合。', '通算30試合無失点（GK・DF）', (c) => c.T.cs >= 30],
    ['cs60', '鉄壁', '誰もその壁を越えられない。', '通算60試合無失点', (c) => c.T.cs >= 60],
    ['cs100', 'ゴールに鍵を', '100試合、ゴールを閉ざした。', '通算100試合無失点', (c) => c.T.cs >= 100],
    ['cs150', '絶対的守護神', '最後の砦は崩れなかった。', '通算150試合無失点', (c) => c.T.cs >= 150],
    ['cap1', '日の丸デビュー', '初めて日の丸を背負った日。', '日本代表に選ばれる', (c) => c.caps >= 1],
    ['cap20', '代表常連', '代表のユニフォームが似合ってきた。', '代表20試合', (c) => c.caps >= 20],
    ['cap50', '代表の柱', '代表チームを支え続けた。', '代表50試合', (c) => c.caps >= 50],
    ['cap80', '代表の顔', '日の丸といえばこの選手。', '代表80試合', (c) => c.caps >= 80],
    ['cap100', 'センチュリオン', '代表100試合の偉業。', '代表100試合', (c) => c.caps >= 100],
    ['ng20', '代表のエース', '代表で20ゴール。', '代表20得点', (c) => c.natGoals >= 20],
    ['wc1', 'W杯戦士', '夢の舞台に立った。', 'ワールドカップに出場', (c) => c.wc >= 1],
    ['wc16', '決勝トーナメントへ', 'グループリーグを突破した。', 'W杯ベスト16以上', (c) => c.wcBest >= 1],
    ['wc8', 'ベスト8の壁を破った', '新しい景色を見た。', 'W杯ベスト8以上', (c) => c.wcBest >= 2],
    ['wc4', '世界4強', '世界の4強に名を連ねた。', 'W杯ベスト4以上', (c) => c.wcBest >= 3],
    ['wc2', '世界2位', 'あと一歩、世界一に届かなかった。', 'W杯準優勝以上', (c) => c.wcBest >= 4],
    ['wcw', 'ワールドカップの英雄', '国中が、あの夏を忘れない。', 'W杯優勝', (c) => c.wcBest >= 5],
    ['wcg', 'W杯ゴール', '世界の舞台でネットを揺らした。', 'W杯で1得点', (c) => c.wcGoals >= 1],
    ['wcgk', 'W杯得点王', '世界の得点王。', 'W杯得点王', (c) => c.wcScorer >= 1],
    ['t1', '優勝の味', '一度味わうと忘れられない。', 'リーグ優勝', (c) => c.lgTitle >= 1],
    ['t3', '常勝の象徴', 'その選手がいるチームは勝つ。', 'リーグ優勝3回', (c) => c.lgTitle >= 3],
    ['t5', '王朝の主', '黄金時代を築いた。', 'リーグ優勝5回', (c) => c.lgTitle >= 5],
    ['s1', '得点王', 'リーグで一番ゴールを決めた。', 'リーグ得点王', (c) => c.scorer >= 1],
    ['s3', '得点王の常連', '得点王争いの主役。', '得点王3回', (c) => c.scorer >= 3],
    ['s5', '得点王の中の得点王', '5度の得点王。', '得点王5回', (c) => c.scorer >= 5],
    ['as1', 'アシスト王', 'リーグで一番アシストした。', 'アシスト王', (c) => c.assistK >= 1],
    ['m1', 'MVP', 'リーグで最も輝いた。', 'リーグMVP', (c) => c.mvp >= 1],
    ['m3', 'リーグの顔', '3度のMVP。', 'MVP3回', (c) => c.mvp >= 3],
    ['b5', 'ベストイレブン常連', '毎年のように選ばれた。', 'ベストイレブン5回', (c) => c.b11 >= 5],
    ['b10', 'ベストイレブンの重鎮', '10度のベストイレブン。', 'ベストイレブン10回', (c) => c.b11 >= 10],
    ['rk', '新人王', '鮮烈なデビュー。', '新人王', (c) => c.rookie >= 1],
    ['wb', '世界の頂点', '世界でいちばんうまい選手。', '世界年間最優秀選手', (c) => c.world >= 1],
    ['wb3', '世界の王', '3度、世界の頂点に立った。', '世界年間最優秀選手3回', (c) => c.world >= 3],
    ['eu1', '海外組', '一度は世界の舞台に立った。', '欧州のクラブでプレー', (c) => c.eu >= 1],
    ['eu6', '欧州の戦士', '本場で長く戦い抜いた。', '欧州で6シーズン', (c) => c.eu >= 6],
    ['eut', '欧州制覇', '本場の頂点に立った。', '欧州リーグ優勝', (c) => c.euTitle >= 1],
    ['l2', '2部の星', '地元の人たちに愛された。', '2部だけで8シーズン以上', (c) => c.only2 && c.seasons >= 8],
    ['promo', '昇格請負人', 'チームを上のリーグへ導いた。', '昇格を2回経験', (c) => c.promo >= 2],
    ['one', '一筋', 'ひとつのクラブに人生を捧げた。', '1クラブだけで10シーズン以上', (c) => c.clubs === 1 && c.seasons >= 10],
    ['nomad', '渡り鳥', 'いくつものユニフォームを着た。', '6クラブ以上でプレー', (c) => c.clubs >= 6],
    ['lg3', '3リーグで得点', 'どのリーグでも決めた。', '3つ以上のリーグで得点', (c) => c.leaguesScored >= 3],
    ['old', '40歳の現役', '40歳まで走り続けた。', '40歳まで現役', (c) => c.age >= 40],
    ['short', '太く短く', '短くても、濃い時間だった。', '30歳以下で引退し、ランクB以上', (c) => c.age <= 30 && c.score >= 2800],
    ['late', '遅咲き', '待った分だけ、大きく咲いた。', '晩成型で総合力80以上', (c) => c.grow === 'late' && c.peakOvr >= 80],
    ['early', '早熟の天才', '若くして頂点に近づいた。', '早熟型で総合力80以上', (c) => c.grow === 'early' && c.peakOvr >= 80],
    ['ovr85', '怪物', '総合力85の怪物。', '総合力85以上', (c) => c.peakOvr >= 85],
    ['wed', '家族の支え', '家族がいたから戦えた。', '結婚する', (c) => c.married],
    ['kids3', '子だくさん', 'にぎやかな家庭。', '子どもが3人', (c) => c.kids >= 3],
    ['cm', 'CMスター', 'お茶の間の人気者。', 'CMに出演', (c) => c.logc('cm') >= 1],
    ['sns', '炎上上等', '何を言われてもプレーで返した。', 'SNSの炎上を気にせず乗り切る', (c) => c.logc('sns') >= 1],
    ['inj', '不死鳥', '何度ケガをしても戻ってきた。', '長期離脱から3回復帰', (c) => c.logc('injury') >= 3],
    ['noinj', '無事之名馬', '大きなケガなく走り抜いた。', '長期離脱なしで15シーズン', (c) => c.logc('injury') === 0 && c.seasons >= 15],
    ['rich', '億万長者', '生涯年俸10億円。', '生涯年俸10億円以上', (c) => c.earned >= 100000],
    ['house', 'マイホーム', '帰る場所ができた。', '家を買う', (c) => c.house],
    ['donor', '地元の恩人', '地元クラブを支え続けた。', '地元クラブに3回寄付', (c) => c.donated >= 3],
    ['edu', '教育熱心', '子どもの未来に投資した。', '子どもの教育費を2回払う', (c) => c.edu >= 2],
    ['h1', 'ハットトリッカー', '1試合3得点。', 'ハットトリック', (c) => c.hats >= 1],
    ['h5', 'ハットトリックの達人', '5度のハットトリック。', 'ハットトリック5回', (c) => c.hats >= 5],
    ['h10', 'ハットトリック王', '10度のハットトリック。', 'ハットトリック10回', (c) => c.hats >= 10],
    ['max4', '1試合4得点', '止められない夜があった。', '1試合で4得点', (c) => c.R.maxGoalsGame >= 4],
    ['st5', '5戦連発', '5試合連続でゴール。', '5試合連続ゴール', (c) => c.R.bestGoalStreak >= 5],
    ['st8', '止まらない', '8試合連続でゴール。', '8試合連続ゴール', (c) => c.R.bestGoalStreak >= 8],
    ['st10', '神懸かり', '10試合連続ゴールの奇跡。', '10試合連続ゴール', (c) => c.R.bestGoalStreak >= 10],
    ['cst5', '5試合連続無失点', '5試合、ゴールを許さなかった。', '5試合連続無失点（GK・DF）', (c) => c.R.bestCsStreak >= 5],
    ['ply100', '100試合連続出場', '休まず100試合。', '100試合連続出場', (c) => c.R.bestPlayStreak >= 100],
    ['rv', '宿命のライバル', '何度もぶつかり合った。', 'ライバルと10回対戦', (c) => c.rv && c.rv.n >= 10],
    ['rvw', 'ライバルに勝ち越し', '最後に笑ったのはこちら。', 'ライバルとの対戦で勝ち越す（5試合以上）', (c) => c.rv && c.rv.n >= 5 && c.rv.w > c.rv.l],
    ['rvl', '永遠の挑戦者', '一度も越えられなかった背中。', 'ライバルとの対戦で負け越す（5試合以上）', (c) => c.rv && c.rv.n >= 5 && c.rv.l > c.rv.w],
    ['rvg', 'ライバル超え', '数字でもライバルを上回った。', '通算でライバルより多く得点（GK・DFは出場数）', (c) => c.rv && (c.pos === 'GK' || c.pos === 'DF' ? c.T.apps > c.rv.apps : c.T.goals > c.rv.goals)],
    ['jt', '親子共演', '親子で同じピッチに立った。', '子どもと同じ試合に出る', (c) => c.joint >= 1],
    ['cb', '親子鷹', '親から子へのホットライン。', '子どものゴールをアシスト', (c) => c.combo >= 1],
    ['cb3', '親子の絆', '何度もつながった親子のパス。', '親子弾を3回', (c) => c.combo >= 3],
    ['gen2', '二代目', '親の背中を追いかけた。', '2代目として引退', (c) => c.gen >= 2],
    ['fam3', 'サッカー一家', '3代続くサッカーの家系。', '3代目として引退', (c) => c.gen >= 3],
    ['fam5', 'サッカー名門', '5代続く名門。', '5代目として引退', (c) => c.gen >= 5],
    ['fam7', 'サッカー王朝', '7代続く王朝。', '7代目として引退', (c) => c.gen >= 7],
    ['lm', '有終の美', '引退試合で最高のプレー。', '引退試合を成功させる', (c) => c.last && c.last.hit],
    ['lmf', '最後まで自分らしく', '外れても、拍手は鳴りやまなかった。', '引退試合で失敗する', (c) => c.last && !c.last.hit],
    ['rC', 'プロとして', 'プロとして生き抜いた。', '生涯ランクC以上', (c) => c.score >= 1800],
    ['rB', '実力者', '確かな実力の持ち主。', '生涯ランクB以上', (c) => c.score >= 2800],
    ['rA', '名選手', '誰もが認める名選手。', '生涯ランクA以上', (c) => c.score >= SL.RANK_MIN.A],
    ['rS', 'スター', '国中が知るスター。', '生涯ランクS以上', (c) => c.score >= SL.RANK_MIN.S],
    ['rSS', 'レジェンド', '語り継がれる伝説。', '生涯ランクSS', (c) => c.score >= SL.RANK_MIN.SS],
    ['pot', '自分を知る者', '自分の限界を知り、その先を目指した。', '才能を完全に見抜く', (c) => c.potKnown],
    ['pot90', '天賦の才', '生まれ持った才能が違った。', '才能90以上で生まれる', (c) => c.pot >= 90],
    ['gkg', 'ゴールを決めたGK', 'キーパーなのに点を取った。', 'GKでゴールを決める', (c) => c.pos === 'GK' && c.T.goals >= 1],
    ['dfg', '攻撃的DF', '守って、攻めた。', 'DFで通算15得点', (c) => c.pos === 'DF' && c.T.goals >= 15],
    ['fwa', 'お膳立て上手のFW', '点を取らせるのもうまかった。', 'FWで通算50アシスト', (c) => c.pos === 'FW' && c.T.assists >= 50],
    ['mfb', '万能型', '点も取れて、アシストもできる。', 'MFで通算50得点・50アシスト', (c) => c.pos === 'MF' && c.T.goals >= 50 && c.T.assists >= 50],
    ['cup', 'カップ王者', '一発勝負を勝ち抜いた。', 'カップ戦で優勝', (c) => c.cup >= 1],
    ['cup3', 'カップ戦の鬼', 'トーナメントに強い。', 'カップ戦で3回優勝', (c) => c.cup >= 3],
    ['cupL2', 'ジャイアントキリング', '2部から大物を次々に倒した。', '2部のクラブでカップ優勝', (c) => c.cupL2 >= 1],
    ['ch_loyal', '一筋の誓い', '最後まで移籍しなかった。', '縛り「一筋」を達成', (c) => c.ch === 'loyal'],
    ['ch_domestic', '国内の雄', '海を渡らず頂点へ。', '縛り「国内一筋」を達成', (c) => c.ch === 'domestic'],
    ['ch_weak', '再建の英雄', '最弱クラブを頂点へ導いた。', '縛り「最弱クラブ再建」を達成', (c) => c.ch === 'weak'],
    ['ch_lowpot', '凡才の逆襲', '才能がなくても、ここまで来た。', '縛り「凡才」を達成', (c) => c.ch === 'lowpot'],
    ['ch_norest', '休まない人', '休まず走り続けた。', '縛り「休養禁止」を達成', (c) => c.ch === 'norest'],
    ['ch_keeper', 'GKの道を極めた', 'キーパー一筋で代表の柱に。', '縛り「GKの道」を達成', (c) => c.ch === 'keeper'],
    ['quickS', '60秒の奇跡', 'たった60秒で伝説になった。', '60秒モードで生涯ランクS以上', (c) => c.mode === 'quick' && c.score >= SL.RANK_MIN.S],
    ['patient', 'じっくり派', '一週一週を大切に生きた。', 'じっくりモードで15シーズン以上', (c) => c.mode === 'normal' && c.seasons >= 15],
    ['ace', 'エースナンバー', 'チームの顔の背番号を背負った。', 'エースの背番号（FW9・MF10・DF4・GK1）を着ける', (c) => c.nums.has(ACE[c.pos])],
    ['nums', '背番号コレクター', 'いろんな番号を背負った。', '5種類以上の背番号を着ける', (c) => c.nums.size >= 5],
    ['star', 'スターの器', '生まれた瞬間から、何かが違った。', 'スターの器として生まれる（一人用・100人に1人くらい）', (c) => c.star],
    ['awake', '覚醒', 'ある年、眠っていた才能が目を覚ました。', '19〜22歳で才能が覚醒する（30人に1人くらい）', (c) => c.awake],
    // ----- LR（神話）：1万人に1人くらい。自動で4900人の人生を送って、どれも0〜1人だった条件 -----
    ['god', 'サッカーの神', '手にできるものは、すべて手にした。', 'W杯優勝・欧州リーグ優勝・世界年間最優秀選手・リーグ優勝・カップ優勝・MVP・新人王をすべて獲る', (c) => c.wcWins >= 1 && c.euTitle >= 1 && c.world >= 1 && c.lgTitle >= 1 && c.cup >= 1 && c.mvp >= 1 && c.rookie >= 1],
    ['g500', 'ゴールの化身', '500。もはや人の数字ではない。', '通算500得点', (c) => c.T.goals >= 500],
    ['ruler', '世界を統べる者', '二度世界を制し、世界一の選手になった。', 'W杯優勝2回＋世界年間最優秀選手', (c) => c.wcWins >= 2 && c.world >= 1],
    ['st33', '不滅の連撃', '33試合、ゴールを決め続けた。', '33試合連続ゴール', (c) => c.R.bestGoalStreak >= 33],
    ['wall', '世界最高の壁', '世界一のチームの、世界一の守護神。', 'GKでW杯優勝・世界年間最優秀選手・通算150試合無失点', (c) => c.pos === 'GK' && c.wcWins >= 1 && c.world >= 1 && c.T.cs >= 150],
  ];
  // ===== オンライン専用の称号 =====
  // oc（オンラインの文脈。サーバーの sim.js が作る）：
  //   lgs：この人生でプレーしたリーグ（略称の Set）、first：デビューしたリーグの略称、youth：育成枠で入団した、motw：週間最優秀の回数、
  //   winter：冬の移籍の回数、maxClubApps：1つのクラブでの最多出場、record：リーグの歴代記録（シーズン得点・アシスト10位以内）に入った、
  //   famClubs：一族（すべての世代）でプレーしたクラブID の Set
  // fam：一族（世代をまたいだ合計）で取る称号。引退した世代の図鑑にも残る
  const EU1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const DOM_ALL = Array.from({ length: 40 }, (_, i) => 10 + i);
  const ONLINE_TITLES = [
    ['ol_motw', '週間MVP', 'その週、リーグでいちばん輝いた。', '週間最優秀選手に選ばれる', (c) => c.motw >= 1],
    ['ol_motw10', '週間MVPの常連', '何度も、その週の主役になった。', '週間最優秀選手に10回選ばれる', (c) => c.motw >= 10],
    ['ol_winter', '冬の決断', 'シーズンの途中で、新しい道を選んだ。', '冬の移籍期間に移籍する', (c) => c.winter >= 1],
    ['ol_legend', 'クラブの象徴', 'そのクラブといえば、この選手。', '1つのクラブで通算100試合出場', (c) => c.maxClubApps >= 100],
    ['ol_record', '歴史に名を刻む', 'オンラインリーグの記録に名前が残った。', 'シーズン得点かアシストで、リーグ歴代10位に入る', (c) => c.record],
    ['ol_dom4', '国内を知り尽くす', '4部から1部まで、すべての舞台に立った。', '1人で国内1〜4部すべてでプレー', (c) => ['1部', '2部', '3部', '4部'].every((x) => c.lgs.has(x))],
    ['ol_eu3', '欧州を渡り歩く', '欧州の1部・2部・3部、すべてで戦った。', '1人で欧州1〜3部すべてでプレー', (c) => ['欧州', '欧州2部', '欧州3部'].every((x) => c.lgs.has(x))],
    ['ol_climb', '下剋上', 'いちばん下から、いちばん上へ。', '国内4部でデビューし、欧州1部でプレー', (c) => c.first === '4部' && c.lgs.has('欧州')],
    ['ol_youth', '育成枠の星', '育成枠から、本場の頂点へ駆け上がった。', '欧州3部の育成枠で入団し、欧州1部でプレー', (c) => c.youth && c.lgs.has('欧州')],
    ['fam_c10', '10のエンブレム', '一族で10のクラブのユニフォームを着た。', '一族（すべての世代の合計）で10クラブでプレー', (c) => c.famClubs.size >= 10, true],
    ['fam_c30', '30のエンブレム', '一族の足跡は、30のクラブに残っている。', '一族で30クラブでプレー', (c) => c.famClubs.size >= 30, true],
    ['fam_eu1', '欧州の名門をめぐる', '欧州1部の10クラブ、すべてに一族の足跡が。', '一族で欧州1部の10クラブすべてでプレー', (c) => EU1.every((id) => c.famClubs.has(id)), true],
    ['fam_dom', '日本中にエンブレムを', '国内40クラブ、すべてに一族の足跡が。', '一族で国内40クラブすべてでプレー', (c) => DOM_ALL.every((id) => c.famClubs.has(id)), true],
    ['fam_c70', '全クラブ制覇', '70のクラブすべてに、一族の足跡がある。', '一族で70クラブすべてでプレー', (c) => c.famClubs.size >= 70, true],
  ];
  // オンラインでは取れない称号（W杯・ライバル・親子・引退試合・出来事・縛り・モード・スターの器）。オンラインの図鑑には出さない
  const ONLINE_HIDE = new Set(['wc1', 'wc16', 'wc8', 'wc4', 'wc2', 'wcw', 'wcg', 'wcgk', 'rv', 'rvw', 'rvl', 'rvg', 'jt', 'cb', 'cb3', 'lm', 'lmf', 'wed', 'kids3', 'cm', 'sns', 'edu',
    'ch_loyal', 'ch_domestic', 'ch_weak', 'ch_lowpot', 'ch_norest', 'ch_keeper', 'quickS', 'patient', 'star', 'god', 'ruler', 'wall']);
  function onlineTitles(oc) { return ONLINE_TITLES.filter((t) => { try { return t[4](oc); } catch { return false; } }).map((t) => t[0]); }
  // オンラインの図鑑に並べる称号（一人用と共通のもの＋オンライン専用）
  const onlineTitleList = () => TITLES.filter((t) => !ONLINE_HIDE.has(t[0])).concat(ONLINE_TITLES);
  const ALL_TITLES = () => TITLES.concat(ONLINE_TITLES);
  const findTitle = (id) => TITLES.find((x) => x[0] === id) || ONLINE_TITLES.find((x) => x[0] === id);

  // ===== レア度 =====
  // RATE：引退した選手のうち、その称号を持っている人の割合（％・目安）。自動で人生を送った600人分から数えた。
  // 自動では出ないもの（2代目以降・縛り・引退試合など）は目安
  const RATE = {
    ol_motw: 20, ol_motw10: 3, ol_winter: 15, ol_legend: 12, ol_record: 4, ol_dom4: 5, ol_eu3: 1.5, ol_climb: 1, ol_youth: 0.8,
    fam_c10: 6, fam_c30: 0.8, fam_eu1: 0.3, fam_dom: 0.2, fam_c70: 0.04,
    p50: 100,
    p100: 100,
    cap1: 100,
    wc1: 99.8,
    cap20: 99.5,
    rC: 99.2,
    wed: 98.7,
    cm: 98.7,
    p200: 96.5,
    ace: 96,
    edu: 95.2,
    cap50: 92.5,
    wc16: 92.5,
    house: 91.7,
    sns: 85,
    eu1: 82.5,
    rB: 81,
    star: 1, awake: 3, god: 0.01, g500: 0.01, ruler: 0.01, st33: 0.01, wall: 0.01,
    kids3: 79.5,
    rvg: 79,
    t1: 78.2,
    eu6: 75.2,
    rich: 73,
    g1: 70.8,
    patient: 66.7,
    nums: 62,
    wcg: 60.8,
    wc8: 60.3,
    rk: 60.2,
    cap80: 52.7,
    b5: 52.7,
    m1: 52.5,
    p300: 52.2,
    cs30: 49.8,
    pot: 44.7,
    h1: 38.7,
    g50: 38.5,
    lg3: 38.3,
    cs60: 36.3,
    rA: 34,
    nomad: 33.3,
    inj: 32.7,
    ovr85: 32,
    wc4: 30.5,
    st5: 29,
    g100: 27.3,
    s1: 25.8,
    ng20: 25.5,
    b10: 24.2,
    max4: 24.2,
    a30: 24,
    h5: 23.3,
    promo: 23.2,
    m3: 22.3,
    rvw: 22.2,
    cup: 22.2,
    rvl: 19.5,
    t3: 18.8,
    eut: 18.8,
    ply100: 17.7,
    cst5: 17.5,
    rv: 15.8,
    g150: 15.7,
    one: 15.3,
    noinj: 15.2,
    wcgk: 13.5,
    h10: 13.5,
    st8: 13.2,
    s3: 13,
    wc2: 12.3,
    late: 12,
    mfb: 11.2,
    as1: 11,
    rS: 10.2,
    g200: 9.3,
    a60: 9,
    st10: 7.7,
    s5: 6.8,
    early: 6.3,
    cap100: 6.2,
    cs100: 6,
    g250: 5.3,
    wcw: 5.1,
    t5: 4,
    jt: 3.3,
    quickS: 2.5,
    g300: 2.2,
    cup3: 2,
    wb: 1.7,
    cupL2: 1,
    rSS: 1.2,
    a100: 0.4,
    cs150: 0.06,
    cb: 0.2,
    a150: 0.05,
    p400: 0.3,
    p500: 0.05,
    wb3: 0.1,
    l2: 0.3,
    old: 0.4,
    short: 1.5,
    donor: 5,
    cb3: 0.1,
    gen2: 30,
    fam3: 8,
    fam5: 1.5,
    fam7: 0.3,
    lm: 50,
    lmf: 40,
    pot90: 3,
    gkg: 0.3,
    dfg: 1.5,
    fwa: 1,
    ch_loyal: 3,
    ch_domestic: 3,
    ch_weak: 1,
    ch_lowpot: 1,
    ch_norest: 2,
    ch_keeper: 1,
  };
  // 割合の低いものほど上。[id, 名前, この割合より低ければ]
  const RARITY = [
    { id: 'LR', name: '神話', below: 0.05, rank: 5 },
    { id: 'UR', name: '伝説', below: 0.5, rank: 4 },
    { id: 'SSR', name: '激レア', below: 2, rank: 3 },
    { id: 'SR', name: 'スーパーレア', below: 8, rank: 2 },
    { id: 'R', name: 'レア', below: 25, rank: 1 },
    { id: 'N', name: 'ノーマル', below: Infinity, rank: 0 },
  ];
  const rateOf = (id) => (RATE[id] != null ? RATE[id] : 10);
  const rarityOf = (id) => { const r = rateOf(id); return RARITY.find((x) => r < x.below); };
  // いちばんレアな称号（割合がいちばん低いもの。同じなら図鑑で後ろのもの）
  function topTitle(ids) {
    let best = null;
    for (const id of ids || []) {
      if (!findTitle(id)) continue;
      const at = (x) => ALL_TITLES().findIndex((t) => t[0] === x);
      if (!best || rateOf(id) < rateOf(best) || (rateOf(id) === rateOf(best) && at(id) > at(best))) best = id;
    }
    return best;
  }
  // レアな順に並べる
  const byRarity = (ids) => (ids || []).slice().sort((a, b) => rateOf(a) - rateOf(b));
  function earnedTitles(s, sum) {
    const c = titleContext(s, sum);
    return TITLES.filter((t) => { try { return t[4](c); } catch { return false; } }).map((t) => t[0]);
  }
  const titleInfo = (id) => { const t = findTitle(id); return t ? { id: t[0], name: t[1], desc: t[2], hint: t[3], rarity: rarityOf(id), rate: rateOf(id), online: ONLINE_TITLES.includes(t), fam: !!t[5] } : null; };

  // ===== 実績（端末に残る、すべての人生を通しての目標） =====
  // [id, 名前, 説明, (コレクション) => [いま, 目標]]
  const LETTERS = ['D', 'C', 'B', 'A', 'S', 'SS'];
  const best = (col, l) => LETTERS.indexOf(col.stats.bestLetter || 'D') >= LETTERS.indexOf(l) && col.stats.careers > 0 ? 1 : 0;
  const posBest = (col, pos, l) => LETTERS.indexOf((col.stats.posBest || {})[pos] || '') >= LETTERS.indexOf(l) ? 1 : 0;
  const ACHIEVEMENTS = [
    ['c1', 'プロの一生', '選手を1人引退させる', (c) => [c.stats.careers, 1]],
    ['c5', '5つの人生', '選手を5人引退させる', (c) => [c.stats.careers, 5]],
    ['c10', '10の物語', '選手を10人引退させる', (c) => [c.stats.careers, 10]],
    ['c30', '人生の語り部', '選手を30人引退させる', (c) => [c.stats.careers, 30]],
    ['pos4', '全ポジション経験', 'FW・MF・DF・GKすべてで引退させる', (c) => [Object.keys(c.stats.positions || {}).length, 4]],
    ['fwS', 'FWのスター', 'FWで生涯ランクS以上', (c) => [posBest(c, 'FW', 'S'), 1]],
    ['mfS', 'MFのスター', 'MFで生涯ランクS以上', (c) => [posBest(c, 'MF', 'S'), 1]],
    ['dfS', 'DFのスター', 'DFで生涯ランクS以上', (c) => [posBest(c, 'DF', 'S'), 1]],
    ['gkS', 'GKのスター', 'GKで生涯ランクS以上', (c) => [posBest(c, 'GK', 'S'), 1]],
    ['rkA', 'Aランク到達', '生涯ランクA以上の選手を出す', (c) => [best(c, 'A'), 1]],
    ['rkS', 'Sランク到達', '生涯ランクS以上の選手を出す', (c) => [best(c, 'S'), 1]],
    ['rkSS', 'SSランク到達', '生涯ランクSSの選手を出す', (c) => [best(c, 'SS'), 1]],
    ['clubs10', 'ユニフォーム10枚', 'のべ10クラブでプレーする（すべての選手の合計）', (c) => [(c.stats.clubs || []).length, 10]],
    ['clubs20', 'ユニフォーム20枚', 'のべ20クラブでプレーする', (c) => [(c.stats.clubs || []).length, 20]],
    ['clubs30', '全クラブ制覇', '70クラブすべてでプレーする', (c) => [(c.stats.clubs || []).length, 70]],
    ['goals500', '500ゴール', 'すべての選手の通算ゴールが500', (c) => [c.stats.goals, 500]],
    ['goals1000', '1000ゴール', 'すべての選手の通算ゴールが1000', (c) => [c.stats.goals, 1000]],
    ['apps2000', '2000試合', 'すべての選手の通算出場が2000試合', (c) => [c.stats.apps, 2000]],
    ['wc1', '世界一', 'ワールドカップで優勝する', (c) => [c.stats.wcWins, 1]],
    ['wc3', '世界一を3度', 'ワールドカップで3回優勝する（すべての選手の合計）', (c) => [c.stats.wcWins, 3]],
    ['world', '世界最優秀選手', '世界年間最優秀選手に選ばれる', (c) => [c.stats.worldBest, 1]],
    ['eu5', '海を渡った5人', '欧州でプレーした選手を5人出す', (c) => [c.stats.euPlayers, 5]],
    ['gen3', '3代続く一族', '3代目まで続ける', (c) => [c.stats.maxGen, 3]],
    ['gen5', '5代続く一族', '5代目まで続ける', (c) => [c.stats.maxGen, 5]],
    ['gen7', '7代続く一族', '7代目まで続ける', (c) => [c.stats.maxGen, 7]],
    ['t10', '称号10個', '称号を10種類集める', (c) => [Object.keys(c.titles).length, 10]],
    ['t30', '称号30個', '称号を30種類集める', (c) => [Object.keys(c.titles).length, 30]],
    ['t60', '称号60個', '称号を60種類集める', (c) => [Object.keys(c.titles).length, 60]],
    ['t100', '称号100個', '称号を100種類集める', (c) => [Object.keys(c.titles).length, 100]],
    ['ch1', '縛りに挑む者', '縛りプレイを1つ達成する', (c) => [(c.stats.challenges || []).length, 1]],
    ['ch3', '縛りの達人', '縛りプレイを3つ達成する', (c) => [(c.stats.challenges || []).length, 3]],
    ['ch6', '縛りの王', '縛りプレイを6つすべて達成する', (c) => [(c.stats.challenges || []).length, 6]],
    ['quickS', '60秒のスター', '60秒モードで生涯ランクS以上', (c) => [c.stats.quickS || 0, 1]],
    ['quick10', '早送りの人生', '60秒モードで10人引退させる', (c) => [c.stats.quick || 0, 10]],
    ['online1', 'オンラインの一生', 'オンラインリーグで1人引退させる', (c) => [c.stats.online || 0, 1]],
    ['cup3', 'カップ戦の常連', 'カップ戦で3回優勝する（すべての選手の合計）', (c) => [c.stats.cups || 0, 3]],
    ['combo', '親子弾', '親子弾を決める', (c) => [c.stats.combos || 0, 1]],
    ['rich', '100億円', 'すべての選手の生涯年俸の合計が100億円', (c) => [c.stats.earned || 0, 1000000]],
    ['last10', '有終の美×10', '引退試合を10回成功させる', (c) => [c.stats.lastHits || 0, 10]],
    ['pot', '自分を知る', '才能を完全に見抜いた選手を出す', (c) => [c.titles.pot ? 1 : 0, 1]],
  ];
  function newCollection() { return { v: 1, titles: {}, ach: {}, stats: { careers: 0, positions: {}, posBest: {}, clubs: [], goals: 0, apps: 0, wcWins: 0, worldBest: 0, euPlayers: 0, maxGen: 0, challenges: [], cups: 0, combos: 0, earned: 0, lastHits: 0, quick: 0, quickS: 0, online: 0 } }; }
  // 引退した選手1人分をコレクションに足す。新しく手に入れた称号と実績を返す
  function addToCollection(col, sum, kind = sum.mode) {
    col = col && col.v === 1 ? col : newCollection();
    const st = col.stats, newT = [], newA = [];
    const before = new Set(ACHIEVEMENTS.filter((a) => { const [n, g] = a[3](col); return n >= g; }).map((a) => a[0]));
    st.careers++;
    st.positions[sum.pos] = (st.positions[sum.pos] || 0) + 1;
    const better = (a, b) => LETTERS.indexOf(a) > LETTERS.indexOf(b || '');
    if (better(sum.letter, st.posBest[sum.pos])) st.posBest[sum.pos] = sum.letter;
    if (better(sum.letter, st.bestLetter)) st.bestLetter = sum.letter;
    st.clubs = [...new Set(st.clubs.concat(sum.clubIds || []))];
    st.goals += sum.goals; st.apps += sum.apps;
    st.wcWins += sum.wc.filter((w) => w.reached === '優勝').length;
    st.worldBest += sum.worldBest || 0;
    if (sum.eu) st.euPlayers++;
    st.maxGen = Math.max(st.maxGen, sum.gen);
    if (sum.challenge && sum.challenge.cleared && !st.challenges.includes(sum.challenge.id)) st.challenges.push(sum.challenge.id);
    st.cups += sum.cupWins || 0;
    st.combos += (sum.family && sum.family.combo) || 0;
    st.earned += sum.earned || 0;
    if (sum.lastMatch && sum.lastMatch.hit) st.lastHits++;
    if (kind === 'quick') { st.quick++; if (sum.score >= SL.RANK_MIN.S) st.quickS++; }
    if (kind === 'online') st.online++;
    for (const id of sum.titles || []) if (!col.titles[id]) { col.titles[id] = { by: sum.name, y: sum.endYear }; newT.push(id); }
    for (const a of ACHIEVEMENTS) { const [n, g] = a[3](col); if (n >= g && !before.has(a[0]) && !col.ach[a[0]]) { col.ach[a[0]] = Date.now(); newA.push(a[0]); } }
    return { col, newTitles: newT, newAch: newA };
  }

  Object.assign(SL, { ONLINE_TITLES, ONLINE_HIDE, onlineTitles, onlineTitleList, TITLES, RARITY, rarityOf, rateOf, topTitle, byRarity, titleInfo, earnedTitles, ACHIEVEMENTS, newCollection, addToCollection });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
