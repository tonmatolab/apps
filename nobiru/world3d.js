// のびーるトルコアイスの3D表示（Three.js）。ゲームの進み方は index.html 側で決め、ここは見た目だけを描く
// 座標：y＝上、x＝左右、z＝手前。アイスは x=0, z=0 を通って真上へ伸びる。
// 高さは「引っ張った量」に比例させている（＝実際の長さの対数）。だから月まで行っても数百単位で収まる
(function () {
  if (!window.THREE) return;
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  const GROUND = -1.6;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EF = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const JF = '"Zen Maru Gothic", sans-serif';
  let K = .005, TIP0 = .3, pOf = () => 0, lenOf = () => 0, MOON = 384400000, REDUCE = false;
  const Y = (alt) => pOf(alt) * K + TIP0;
  const tipOf = (P) => Math.max(0, P) * K + TIP0;

  // ===== 形・色・テクスチャの道具 =====
  const G = {
    box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(.5, 18, 14), cyl: new T.CylinderGeometry(.5, .5, 1, 14),
    cone: new T.ConeGeometry(.5, 1, 14), rock: new T.DodecahedronGeometry(.5, 0),
  };
  const MC = {};
  const mat = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return MC[k] || (MC[k] = new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); };
  function part(geo, c, sx, sy, sz, x, y, z, parent) {
    const m = new T.Mesh(G[geo] || geo, typeof c === 'string' ? mat(c) : c);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); if (parent) parent.add(m); return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }
  const rep = (t, rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.wrapS = c.wrapT = T.RepeatWrapping; c.repeat.set(rx, ry); return c; };
  const ETX = {};
  const emojiTex = (e) => ETX[e] || (ETX[e] = canvasTex(128, 128, (x) => { x.font = `100px ${EF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 64, 72); }));
  function emoji(e, s, parent, x = 0, y = 0, z = 0) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: emojiTex(e), transparent: true }));
    sp.scale.set(s, s, 1); sp.position.set(x, y, z); if (parent) parent.add(sp); return sp;
  }
  function setEmoji(sp, e) { if (sp.userData.e === e) return; sp.userData.e = e; sp.material.map = emojiTex(e); sp.material.needsUpdate = true; }
  const LTX = {};
  function labelTex(text, bg, fg) {
    const k = text + '|' + bg + '|' + fg; if (LTX[k]) return LTX[k];
    const m = document.createElement('canvas').getContext('2d'); m.font = `900 56px ${JF}`;
    const w = Math.ceil(m.measureText(text).width) + 64;
    const tex = canvasTex(w, 96, (x, W, H) => {
      x.fillStyle = bg; x.beginPath(); x.roundRect(2, 2, W - 4, H - 4, 46); x.fill();
      x.fillStyle = fg; x.font = `900 56px ${JF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 4);
    });
    return (LTX[k] = { tex, aspect: w / 96 });
  }
  function label(text, h = .3, bg, fg, parent, x = 0, y = 0, z = 0) {
    const sp = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false }));
    sp.renderOrder = 5; sp.userData.h = h; sp.position.set(x, y, z); setLabel(sp, text, bg, fg); if (parent) parent.add(sp); return sp;
  }
  function setLabel(sp, text, bg = 'rgba(255,255,255,.95)', fg = '#3b2a22') {
    if (sp.userData.text === text && sp.userData.bg === bg) return;
    sp.userData.text = text; sp.userData.bg = bg;
    if (!text) { sp.visible = false; return; }
    sp.visible = true;
    const L = labelTex(text, bg, fg); sp.material.map = L.tex; sp.material.needsUpdate = true; sp.scale.set(sp.userData.h * L.aspect, sp.userData.h, 1);
  }
  const UP = new T.Vector3(0, 1, 0), tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
  // 2点を結ぶ円柱（棒・腕）
  function placeLimb(mesh, a, b, r) {
    tmpV.subVectors(b, a); const len = tmpV.length();
    mesh.position.copy(a).addScaledVector(tmpV, .5); mesh.scale.set(r * 2, len, r * 2);
    mesh.quaternion.setFromUnitVectors(UP, tmpV.normalize());
  }

  // ===== 空の色（高さ＝長さの桁数で変わる） =====
  const SKY = [[0, '#9fd8ff', '#fff1d6'], [2, '#86c8ff', '#dff1ff'], [3.3, '#5aa6f0', '#bfe0ff'], [4, '#2f6fc9', '#7fb6f0'], [4.7, '#14285e', '#3a6db8'], [5.3, '#060a1e', '#16234d'], [9, '#020308', '#070a16']];
  const cTmp = new T.Color();
  function skyAt(la, top, bot) {
    let i = 0; while (i < SKY.length - 2 && la > SKY[i + 1][0]) i++;
    const k = clamp((la - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]), 0, 1);
    top.set(SKY[i][1]).lerp(cTmp.set(SKY[i + 1][1]), k); bot.set(SKY[i][2]).lerp(cTmp.set(SKY[i + 1][2]), k);
  }

  let R = null, scene, cam, sky, skyMat, stars, starMat, hemi, sun, earth, moon;
  const W = { w: 1, h: 1 };
  const TX = {};
  const O = {}; // 動かす物たち

  function makeTextures() {
    TX.walk = canvasTex(256, 256, (x, S) => { x.fillStyle = '#d9c7ae'; x.fillRect(0, 0, S, S); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#d2bea3' : '#e0cfb8'; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60); } });
    TX.road = canvasTex(256, 256, (x, S) => { x.fillStyle = '#4a4d55'; x.fillRect(0, 0, S, S); for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${hash(i) * .08})`; x.fillRect(hash(i + 1) * S, hash(i + 2) * S, 2, 2); } x.fillStyle = '#f1f1f1'; x.fillRect(0, S / 2 - 4, S / 2, 8); });
    TX.win = canvasTex(256, 256, (x, S) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const lit = hash(r * 2 + c + 3) > .6, g = x.createLinearGradient(0, 0, 0, 100);
        g.addColorStop(0, lit ? '#ffe7a8' : '#8aa3bf'); g.addColorStop(1, lit ? '#f5c46a' : '#55708f');
        x.fillStyle = g; x.fillRect(20 + c * 128, 24 + r * 128, 88, 80); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(20 + c * 128, 24 + r * 128, 26, 80);
      }
    });
    TX.waffle = canvasTex(128, 128, (x, S) => { x.fillStyle = '#d89a4a'; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(120,70,20,.55)'; x.lineWidth = 4; for (let i = -S; i < S * 2; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); x.beginPath(); x.moveTo(i + S, 0); x.lineTo(i, S); x.stroke(); } });
    TX.stripe = canvasTex(256, 64, (x, S) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#e8434f'; x.fillRect(i * 32, 0, 32, 64); } });
    TX.sign = canvasTex(1024, 180, (x, S, H) => { x.fillStyle = '#8a5a35'; x.fillRect(0, 0, S, H); x.fillStyle = '#6d4426'; x.fillRect(0, 0, S, 14); x.fillStyle = '#ffe9c9'; x.font = '110px "Dela Gothic One"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DONDURMA', S / 2, H / 2 + 10); });
    TX.board = canvasTex(1024, 220, (x, S, H) => { x.fillStyle = '#fff6e6'; x.beginPath(); x.roundRect(6, 6, S - 12, H - 12, 40); x.fill(); x.strokeStyle = '#e8434f'; x.lineWidth = 12; x.stroke(); x.fillStyle = '#e8434f'; x.font = '96px "Dela Gothic One"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('のびーるアイス', S / 2, H / 2 + 8); });
    TX.earth = canvasTex(1024, 512, (x, S, H) => {
      x.fillStyle = '#2a6fc7'; x.fillRect(0, 0, S, H);
      for (let i = 0; i < 26; i++) { x.fillStyle = i % 4 ? '#4f9a52' : '#b49a62'; x.beginPath(); x.ellipse(hash(i) * S, H * .2 + hash(i + 40) * H * .6, 30 + hash(i + 9) * 90, 20 + hash(i + 19) * 50, hash(i + 3) * 3, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 40; i++) { x.beginPath(); x.ellipse(hash(i + 70) * S, hash(i + 90) * H, 40 + hash(i + 5) * 80, 8 + hash(i + 8) * 12, 0, 0, 7); x.fill(); }
    });
    TX.moon = canvasTex(512, 256, (x, S, H) => {
      x.fillStyle = '#e9e3c9'; x.fillRect(0, 0, S, H);
      for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(140,130,105,${.15 + hash(i) * .25})`; x.beginPath(); x.arc(hash(i + 3) * S, hash(i + 7) * H, 4 + hash(i + 11) * 26, 0, 7); x.fill(); }
    });
  }

  // ===== 人・物（ローポリ） =====
  function makeCrow() {
    const g = new T.Group(), b = new T.Group(); g.add(b);
    part('sph', '#1b1b22', .42, .26, .26, 0, 0, 0, b);
    part('sph', '#1b1b22', .2, .2, .2, .2, .1, 0, b);
    const beak = part('cone', '#f2b134', .07, .16, .07, .33, .09, 0, b); beak.rotation.z = -Math.PI / 2;
    part('sph', '#ffffff', .05, .05, .05, .26, .14, .07, b);
    part('box', '#1b1b22', .2, .03, .14, -.25, .02, 0, b);
    const wings = [-1, 1].map((sd) => { const w = new T.Group(); w.position.set(0, .07, sd * .1); part('box', '#2b2b34', .26, .02, .34, 0, 0, sd * .17, w); b.add(w); return w; });
    g.userData = { wings, side: [-1, 1] };
    return g;
  }
  function flapCrow(c, t) { const a = Math.sin(t) * .8; c.userData.wings[0].rotation.x = a; c.userData.wings[1].rotation.x = -a; }
  function makePlane() {
    const g = new T.Group();
    const f = part('cyl', '#f4f6fa', .5, 3.4, .5, 0, 0, 0, g); f.rotation.z = Math.PI / 2;
    part('sph', '#f4f6fa', .5, .5, .5, 1.7, 0, 0, g);
    const tail = part('cone', '#f4f6fa', .5, .9, .5, -2.1, .05, 0, g); tail.rotation.z = Math.PI / 2;
    part('box', '#dfe5ee', .9, .06, 4.2, .1, -.08, 0, g);
    part('box', '#3d7be0', .5, .7, .06, -2.1, .4, 0, g);
    part('box', '#dfe5ee', .4, .05, 1.4, -2.15, .1, 0, g);
    part('box', '#3d7be0', 3.2, .08, .52, 0, -.05, 0, g);
    for (let i = 0; i < 8; i++) part('box', '#28324a', .12, .1, .52, -1.2 + i * .34, .1, 0, g);
    return g;
  }
  function makeSatellite() {
    const g = new T.Group();
    part('box', '#d6b04a', .5, .5, .5, 0, 0, 0, g);
    for (const sd of [-1, 1]) { part('box', '#2b4f9e', 1.3, .03, .55, sd * .95, 0, 0, g); part('cyl', '#999', .03, .5, .03, sd * .3, 0, 0, g).rotation.z = Math.PI / 2; }
    part('sph', '#ddd', .22, .1, .22, 0, .3, 0, g);
    return g;
  }
  function makeUfo() {
    const g = new T.Group();
    part(new T.CylinderGeometry(.95, .6, .22, 24), '#b8c0cc', 1, 1, 1, 0, 0, 0, g);
    part(new T.CylinderGeometry(.6, .95, .1, 24), '#8e97a6', 1, 1, 1, 0, .16, 0, g);
    part('sph', new T.MeshLambertMaterial({ color: '#8ff5ff', transparent: true, opacity: .75 }), .75, .55, .75, 0, .3, 0, g);
    emoji('👽', .42, g, 0, .32, 0);
    const lights = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; lights.push(part('sph', new T.MeshBasicMaterial({ color: '#ffe066' }), .1, .1, .1, Math.cos(a) * .82, -.02, Math.sin(a) * .82, g)); }
    const beam = new T.Mesh(new T.CylinderGeometry(.18, .75, 1, 20, 1, true), new T.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: .28, depthWrite: false, side: T.DoubleSide, fog: false }));
    g.add(beam);
    g.userData = { lights, beam };
    return g;
  }
  function cloud(x, y, z, s, parent) {
    const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    const m = mat('#ffffff', { emissive: '#6c7a8c' });
    for (let i = 0; i < 6; i++) part('sph', m, 1.4 + hash(i + x) * .9, 1 + hash(i + y) * .5, 1.2, (i - 2.5) * .75, hash(i * 3 + z) * .4, hash(i + 7) * .6 - .3, g);
    parent.add(g); return g;
  }

  // ===== 世界をつくる =====
  function build() {
    makeTextures();
    scene = new T.Scene();
    scene.fog = new T.Fog('#fff1d6', 25, 170);
    cam = new T.PerspectiveCamera(55, 1, .05, 1200);
    hemi = new T.HemisphereLight('#ffffff', '#b9a68f', .85); scene.add(hemi);
    sun = new T.DirectionalLight('#fff4e0', 1.05); sun.position.set(3, 6, 5); scene.add(sun); scene.add(sun.target);
    // 空（カメラについてくる大きな球の内側にグラデーション）
    skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color() }, bot: { value: new T.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float k = smoothstep(-0.25, 0.65, vP.y); gl_FragColor = vec4(mix(bot, top, k), 1.0); \n#include <encodings_fragment>\n }',
    });
    sky = new T.Mesh(new T.SphereGeometry(600, 24, 16), skyMat); sky.renderOrder = -10; scene.add(sky);
    { const n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = hash(i) * 2 - 1, a = hash(i + 500) * Math.PI * 2, r = Math.sqrt(1 - u * u); p[i * 3] = r * Math.cos(a) * 500; p[i * 3 + 1] = u * 500; p[i * 3 + 2] = r * Math.sin(a) * 500; }
      const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(p, 3));
      starMat = new T.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
      stars = new T.Points(gg, starMat); scene.add(stars); }
    earth = new T.Mesh(new T.SphereGeometry(60, 48, 32), new T.MeshLambertMaterial({ map: TX.earth, fog: false, emissive: '#0b1d3a' })); earth.visible = false; scene.add(earth);
    moon = new T.Mesh(new T.SphereGeometry(14, 40, 28), new T.MeshLambertMaterial({ map: TX.moon, fog: false, emissive: '#7d7864', emissiveMap: TX.moon }));
    moon.position.set(0, Y(MOON) + 14.6, -8); scene.add(moon);
    O.rabbit = emoji('🐇', .9, scene, 1.7, Y(MOON) + 1.15, -1.2);
    O.mochi = emoji('🍡', .5, scene, 2.35, Y(MOON) + 1.05, -1.1);
    O.rabbitSay = label('おもち いる？', .26, undefined, undefined, scene, 1.7, Y(MOON) + 1.85, -1.2);

    // 地面と街
    const ground = new T.Mesh(new T.PlaneGeometry(500, 500), new T.MeshLambertMaterial({ map: rep(TX.walk, 140, 140) }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; scene.add(ground);
    const road = new T.Mesh(new T.PlaneGeometry(500, 6), new T.MeshLambertMaterial({ map: rep(TX.road, 90, 1) }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, GROUND + .01, -9); scene.add(road);
    const cityCols = ['#d9c2a8', '#c9b7a4', '#b8c4cf', '#e3d3c0', '#a9b3bd', '#d6cbb9'];
    for (let i = 0; i < 46; i++) {
      const x = (hash(i) - .5) * 170, z = -28 - hash(i + 30) * 60; if (Math.abs(x) < 16) continue;
      const w = 3 + hash(i + 60) * 6, h = 5 + hash(i + 90) * 28;
      const m = new T.Mesh(G.box, new T.MeshLambertMaterial({ color: cityCols[i % cityCols.length], map: rep(TX.win, Math.round(w / 1.6), Math.round(h / 1.6)) }));
      m.scale.set(w, h, w); m.position.set(x, GROUND + h / 2, z); scene.add(m);
    }
    // 両側のビル（左26m・右48m）
    const bL = Y(26) - GROUND, bR = Y(48) - GROUND;
    const bmL = new T.Mesh(G.box, new T.MeshLambertMaterial({ color: '#e2c9ad', map: rep(TX.win, 2, Math.round(bL / 1.5)) })); bmL.scale.set(3, bL, 3); bmL.position.set(-5.4, GROUND + bL / 2, -2.6); scene.add(bmL);
    const bmR = new T.Mesh(G.box, new T.MeshLambertMaterial({ color: '#cdbba8', map: rep(TX.win, 2, Math.round(bR / 1.5)) })); bmR.scale.set(3.2, bR, 3.2); bmR.position.set(5.6, GROUND + bR / 2, -3); scene.add(bmR);
    part('box', '#b8a48d', 3.3, .3, 3.3, -5.4, Y(26) + .15, -2.6, scene);
    part('box', '#a8957f', 3.5, .3, 3.5, 5.6, Y(48) + .15, -3, scene);
    // 洗濯物（4m）
    { const y = Y(4); part('cyl', '#7a6a5a', .04, 3, .04, -3.4, y, -1.6, scene).rotation.z = Math.PI / 2;
      emoji('👕', .75, scene, -3.9, y - .38, -1.5); emoji('🧦', .55, scene, -3.0, y - .3, -1.5); emoji('🩲', .55, scene, -2.4, y - .3, -1.5); }
    // おばあちゃん（7m）
    O.granny = emoji('👵', .95, scene, 3.95, Y(7), -1.7); label('あら〜', .3, undefined, undefined, scene, 3.2, Y(7) + .7, -1.6);
    // 電線（12m）とカラス
    { const y = Y(12);
      for (const d of [0, .35]) { const cv = new T.CatmullRomCurve3([new T.Vector3(-4, y + d, -1.2), new T.Vector3(0, y + d - .55, -1.2), new T.Vector3(4.1, y + d, -1.2)]);
        scene.add(new T.Mesh(new T.TubeGeometry(cv, 24, .025, 5), mat('#2d2d2d'))); }
      for (const x of [-2.6, 2.4]) { const c = makeCrow(); c.position.set(x, y - .12, -1.2); c.scale.set(x < 0 ? 1 : -1, 1, 1); scene.add(c); } }
    // 屋上の会社員（48m）
    emoji('🧑‍💼', 1, scene, 4.8, Y(48) + .8, -1.8); label('!?', .34, undefined, undefined, scene, 4.2, Y(48) + 1.6, -1.6);
    // 鳥の群れ（250m）・風船（600m）
    O.flock = new T.Group(); O.flock.position.set(0, Y(250), -3); scene.add(O.flock);
    for (let i = 0; i < 7; i++) { const c = makeCrow(); c.scale.setScalar(.6); c.position.set(-3 + i * .9, (i % 3) * .35, -i * .3); O.flock.add(c); }
    O.balloon = emoji('🎈', 1.1, scene, 2.4, Y(600), -1);
    // 雲
    O.clouds = new T.Group(); scene.add(O.clouds);
    for (let i = 0; i < 16; i++) { const alt = 700 * Math.pow(12, hash(i + 3)); const side = i % 2 ? 1 : -1; cloud(side * (2.2 + hash(i) * 7), Y(alt), -2 - hash(i + 9) * 9 + (i % 5 === 0 ? 7 : 0), .7 + hash(i + 2) * .8, O.clouds); }
    // 飛行機（10km）
    O.plane = makePlane(); O.plane.position.set(4, Y(10000), -5); O.plane.rotation.y = .5; scene.add(O.plane);
    O.planeSay = label('機長「危ないです」', .3, undefined, undefined, scene, 2.4, Y(10000) + 1.3, -3);
    // 宇宙の物たち
    O.sat = makeSatellite(); O.sat.position.set(-2.4, Y(400000), -1.5); scene.add(O.sat);
    O.astro = emoji('🧑‍🚀', 1.1, scene, 2.4, Y(2000000), -1); label('え、アイス？', .3, undefined, undefined, scene, 2.1, Y(2000000) + .9, -.8);
    O.comet = emoji('☄️', 1.4, scene, -2.6, Y(3e7), -2);

    // 屋台
    const counter = part('box', '#8a5a35', 4.8, .85, .6, -.3, GROUND + .425, -.15, scene);
    const sign = new T.Mesh(new T.PlaneGeometry(4.8, .84), new T.MeshLambertMaterial({ map: TX.sign })); sign.position.set(-.3, GROUND + .43, .151); scene.add(sign);
    part('box', '#6d4426', 4.9, .08, .7, -.3, GROUND + .88, -.15, scene);
    for (const [x, c] of [[-2.2, '#fffaf0'], [-1.8, '#ffd0dc'], [1.2, '#a8714f'], [1.6, '#b9d68a']]) { part('cyl', '#c9c9c9', .34, .2, .34, x, GROUND + 1.0, -.3, scene); part('sph', c, .3, .16, .3, x, GROUND + 1.1, -.3, scene); }
    const awn = new T.Mesh(new T.BoxGeometry(5, .12, 1.6), [mat('#e8434f'), mat('#e8434f'), new T.MeshLambertMaterial({ map: rep(TX.stripe, 4, 1) }), mat('#e8434f'), new T.MeshLambertMaterial({ map: rep(TX.stripe, 4, 1) }), mat('#e8434f')]);
    awn.position.set(-.6, GROUND + 3.0, -1.1); awn.rotation.x = .22; scene.add(awn);
    for (const x of [-3, 1.8]) part('cyl', '#7a7a7a', .07, 3, .07, x, GROUND + 1.5, -1.7, scene);
    const board = new T.Mesh(new T.PlaneGeometry(2.6, .56), new T.MeshLambertMaterial({ map: TX.board, transparent: true })); board.position.set(-.6, GROUND + 3.45, -1.75); scene.add(board);

    // おじさん（マッチョなトマト）
    O.V = new T.Group(); O.V.position.set(-1.25, GROUND, -.85); scene.add(O.V);
    const vb = O.vb = new T.Group(); O.V.add(vb);
    for (const sd of [-1, 1]) part('box', '#2b2b33', .17, .9, .2, sd * .13, .45, 0, vb);
    part('cyl', '#ffffff', .66, .74, .46, 0, 1.25, 0, vb);
    part('box', '#c8303c', .56, .64, .06, 0, 1.24, .22, vb);
    part('sph', '#f0c49c', .2, .2, .2, 0, 1.62, .02, vb);
    const headTex = canvasTex(256, 256, () => {});
    O.head = new T.Sprite(new T.SpriteMaterial({ map: headTex, transparent: true })); O.head.scale.set(.82, .82, 1); O.head.position.set(0, 1.95, .05); vb.add(O.head);
    { const img = new Image(); img.onload = () => { const c = headTex.image, x = c.getContext('2d'); x.save(); x.beginPath(); x.arc(128, 128, 124, 0, 7); x.clip(); x.drawImage(img, 0, 0, 256, 256); x.restore(); headTex.needsUpdate = true; }; img.src = '../icons/icon-192.png'; }
    O.fez = part(new T.CylinderGeometry(.11, .15, .24, 16), '#b71c2b', 1, 1, 1, 0, 2.43, 0, vb);
    part('sph', '#222', .06, .06, .06, .12, 2.38, .05, vb);
    O.armR = part('cyl', '#f0c49c', 1, 1, 1, 0, 0, 0, scene); O.armL = part('cyl', '#f0c49c', 1, 1, 1, 0, 0, 0, scene);
    O.stick = part('cyl', '#9aa4ad', 1, 1, 1, 0, 0, 0, scene);
    O.bell = emoji('🔔', .3, scene, 0, 0, 0);
    O.vSay = label('', .3, undefined, undefined, scene, -1.25, GROUND + 2.95, -.4);

    // コーンとアイスのかたまり
    O.coneG = new T.Group(); scene.add(O.coneG);
    O.iceMat = new T.MeshPhongMaterial({ color: '#fffaf0', shininess: 50, specular: '#3a3a3a', emissive: '#2a2018', side: T.DoubleSide });
    O.blob = part('sph', O.iceMat, .52, .42, .52, 0, .08, 0, O.coneG);
    part('sph', '#ff9bb1', .13, .08, .12, .1, .26, .08, O.coneG);
    const cone = new T.Mesh(new T.ConeGeometry(.22, .6, 18, 1, true), new T.MeshLambertMaterial({ map: rep(TX.waffle, 2, 1), side: T.DoubleSide }));
    cone.rotation.x = Math.PI; cone.position.y = -.27; O.coneG.add(cone);
    part(new T.TorusGeometry(.215, .035, 8, 24), '#c0843c', 1, 1, 1, 0, .03, 0, O.coneG).rotation.x = Math.PI / 2;

    // のびるアイス本体（毎フレーム頂点を動かす）
    O.ice = new T.Mesh(iceGeo, O.iceMat); O.ice.frustumCulled = false; scene.add(O.ice);

    // 手（上から腕が下りてきてアイスの先をつまむ）
    O.hand = new T.Group(); scene.add(O.hand);
    const hb = O.handB = new T.Group(); O.hand.add(hb); hb.rotation.set(.38, 0, -.2);
    const skin = '#f6c9a4';
    part('sph', skin, .36, .3, .28, 0, .06, 0, hb);
    for (let i = 0; i < 4; i++) part('sph', skin, .1, .1, .11, -.12 + i * .08, -.03, .11, hb);
    part('sph', skin, .1, .18, .1, -.17, .02, .06, hb);
    part('cyl', '#5b8def', .32, .14, .32, 0, .25, 0, hb);
    part('cyl', '#ff8fab', .27, 6, .27, 0, 3.3, 0, hb);

    // 出来事で出てくる物
    O.crows = [0, 1, 2, 3].map(() => { const c = makeCrow(); c.visible = false; scene.add(c); return c; });
    O.rocks = [0, 1, 2, 3].map(() => { const r = part('rock', mat('#8a8178', { flatShading: true }), .5, .45, .5, 0, 0, 0, scene); r.visible = false; return r; });
    O.items = [0, 1, 2, 3, 4, 5].map(() => { const s = emoji('🍓', .48, scene); s.visible = false; return s; });
    O.ufo = makeUfo(); O.ufo.visible = false; O.ufo.scale.setScalar(.7); scene.add(O.ufo);
    O.evPlane = makePlane(); O.evPlane.visible = false; O.evPlane.scale.setScalar(.75); scene.add(O.evPlane);
    O.sunS = emoji('☀️', 2.2, scene); O.sunS.material.fog = false; O.sunS.visible = false;
    O.drops = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const d = part('sph', O.iceMat, .07, .1, .07, 0, -99, 0, scene); d.userData = { v: 0 }; return d; });
    O.rings = []; O.ghosts = [];
  }

  // ===== のびるアイスの形 =====
  const NR = 120, NS = 12;
  const iceGeo = new T.BufferGeometry(), icePos = new Float32Array((NR + 1) * NS * 3);
  iceGeo.setAttribute('position', new T.BufferAttribute(icePos, 3));
  { const idx = []; for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) { const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + j, d = (i + 1) * NS + (j + 1) % NS; idx.push(a, b, c, b, d, c); } iceGeo.setIndex(idx); }
  const COS = [], SIN = []; for (let j = 0; j < NS; j++) { COS.push(Math.cos(j / NS * Math.PI * 2)); SIN.push(Math.sin(j / NS * Math.PI * 2)); }
  function updateIce(s, top, bx) {
    const bot = .12, L = Math.max(.002, top - bot), Tn = s.T, ev = s.ev && s.ev.type;
    const red = REDUCE ? .35 : 1;
    const amp = ((ev === 'gust' ? .2 : 0) + Tn * Tn * .1 + (ev === 'tug' ? .06 : 0) + (ev === 'ufo' ? .05 : 0)) * red;
    const gdir = ev === 'gust' ? s.ev.dir * .55 * red : 0;
    const neck = Math.min(L * .45, 1.2), snapped = s.snapT > 0, sp = snapped ? 1.2 - s.snapT : 0;
    const iNeck = Math.ceil(NR * Math.pow(neck / L, 1 / 1.7));
    const melt = ev === 'sun' ? .12 : 0;
    for (let i = 0; i <= NR; i++) {
      const u = Math.pow(i / NR, 1.7), d = u * L;
      let y = top - d;
      const env = Math.min(1, d / 1.2) * Math.min(1, (L - d) / 1.2);
      let x = Math.sin(d * 2.3 - s.t * 5) * amp * env + gdir * Math.sin(Math.min(1, d / 4) * Math.PI) * env + bx * u;
      let z = Math.cos(d * 1.6 - s.t * 3.4) * amp * .6 * env;
      let r = (.085 + .04 * Math.min(1, d / .8) + .13 * Math.exp(-(L - d) / .45)) * (1 - .4 * Tn) * (1 + melt * Math.sin(d * 9 + s.t * 2));
      r *= 1 - .75 * Tn * Tn * Tn * Math.exp(-((d - neck) ** 2) / .1);
      r = Math.max(.012, r);
      if (snapped) {
        if (i === iNeck || i === iNeck - 1) r = 0;
        if (i < iNeck) y += sp * sp * 14;
        else { const f = 1 - (d - neck) / Math.max(.01, L - neck); y -= sp * sp * 3.5 * f; x += Math.sin(f * 4 + sp * 6) * sp * f * .8; }
      }
      for (let j = 0; j < NS; j++) { const k = (i * NS + j) * 3; icePos[k] = x + COS[j] * r; icePos[k + 1] = y; icePos[k + 2] = z + SIN[j] * r; }
    }
    iceGeo.attributes.position.needsUpdate = true; iceGeo.computeVertexNormals();
  }

  // ===== ひんやりリング・目標ライン =====
  function setRings(alts) {
    if (!R) return;
    for (const r of O.rings) scene.remove(r);
    O.rings = alts.map((a) => {
      const g = new T.Group(); g.position.set(0, Y(a), 0);
      const ring = new T.Mesh(new T.TorusGeometry(.85, .045, 8, 40), new T.MeshBasicMaterial({ color: '#8fe9ff', transparent: true, opacity: .9, fog: false }));
      ring.rotation.x = Math.PI / 2; g.add(ring);
      const glow = new T.Mesh(new T.CircleGeometry(.85, 32), new T.MeshBasicMaterial({ color: '#c8f6ff', transparent: true, opacity: .18, side: T.DoubleSide, depthWrite: false, fog: false }));
      glow.rotation.x = Math.PI / 2; g.add(glow);
      emoji('❄️', .38, g, 1.1, .05, 0);
      scene.add(g); return g;
    });
  }
  function setGhosts(list) {
    if (!R) return;
    for (const g of O.ghosts) scene.remove(g);
    O.ghosts = list.map((gh, i) => {
      const g = new T.Group(); g.position.set(0, tipOf(pOf(gh.m)) - TIP0 + TIP0, 0);
      const ring = new T.Mesh(new T.TorusGeometry(.62, .022, 6, 40), new T.MeshBasicMaterial({ color: gh.color, transparent: true, opacity: .95, fog: false }));
      ring.rotation.x = Math.PI / 2; g.add(ring);
      const bar = new T.Mesh(new T.PlaneGeometry(3.2, .03), new T.MeshBasicMaterial({ color: gh.color, transparent: true, opacity: .55, fog: false, depthWrite: false })); bar.position.x = .9; g.add(bar);
      label(gh.label, .24, gh.color, '#ffffff', g, 1.45 + (i % 2) * .2, .2, 0);
      scene.add(g); return g;
    });
  }

  // ===== 毎フレーム描く =====
  const camPos = new T.Vector3(1.3, 0, 4.3), camLook = new T.Vector3(), tPos = new T.Vector3(), tLook = new T.Vector3();
  const topC = new T.Color(), botC = new T.Color(), iceC = new T.Color(), c2 = new T.Color();
  let snapCam = true;
  const vHand = new T.Vector3(), vCone = new T.Vector3(), vSh = new T.Vector3();
  function render(s, dt, mode) {
    if (!R) return;
    const demo = mode === 'demo', catching = s.phase === 'catch' || s.phase === 'grab';
    const m = lenOf(s.P), la = Math.log10(1 + m);
    const tip = tipOf(s.P);
    // 空・霧・光
    skyAt(la, topC, botC); skyMat.uniforms.top.value.copy(topC); skyMat.uniforms.bot.value.copy(botC);
    scene.fog.color.copy(botC); scene.fog.far = la < 4 ? 170 : 2500; scene.fog.near = la < 4 ? 25 : 2000;
    const space = clamp((la - 4.2) / 1.2, 0, 1);
    starMat.opacity = space; hemi.intensity = .85 - space * .4;
    // 地球（宇宙から見下ろす）
    earth.visible = la > 4.3;
    if (earth.visible) { const k = clamp((la - 4.3) / 1.5, 0, 1); earth.position.set(0, camPos.y - 66 - (1 - k) * 25, -40); earth.rotation.y = s.t * .02; }
    // 風景の小さな動き
    O.flock.position.x = Math.sin(s.t * .4) * 1.2; O.flock.children.forEach((c, i) => flapCrow(c, s.t * 12 + i));
    O.balloon.position.y = Y(600) + Math.sin(s.t) * .15;
    O.plane.position.x = 4 + Math.sin(s.t * .2) * 1.5;
    O.sat.rotation.y = s.t * .3; O.astro.material.rotation = Math.sin(s.t * .7) * .3;
    // カメラの狙い
    if (demo) { const a = s.t * .22; tPos.set(Math.sin(a) * 4.6 + .4, tip - .25, Math.cos(a) * 4.6 + .6); tLook.set(0, tip - 1.05, 0); }
    else if (catching) { tPos.set(.5, .75, 5.4); tLook.set(-.35, -.3, 0); }
    else {
      const mk = clamp((la - 7.6) / .98, 0, 1);
      tPos.set(1.3 + mk * 1.2, tip - .2 + mk * .3, 4.3 + mk * 2.4); tLook.set(mk * .5, tip - .55 + mk * 1.5, 0);
      if (s.bankT > 0) { const b = 1.3 - s.bankT; tPos.z += b * 2.4; tPos.x += b * .8; tLook.y -= b * .4; }
    }
    const kk = snapCam ? 1 : 1 - Math.exp(-dt * 8); snapCam = false;
    camPos.lerp(tPos, kk); camLook.lerp(tLook, kk);
    cam.position.copy(camPos);
    if (!REDUCE && !demo && s.T > .75 && s.snapT <= 0) cam.position.x += (Math.random() - .5) * .03 * s.T;
    cam.lookAt(camLook);
    sky.position.copy(cam.position); stars.position.copy(cam.position);
    sun.position.set(cam.position.x + 3, cam.position.y + 6, 5); sun.target.position.set(0, cam.position.y - 2, 0);

    // おじさん・コーン
    const cx = catching ? s.cx || 0 : 0;
    O.coneG.position.set(cx, 0, 0);
    O.coneG.rotation.z = s.feintT > 0 ? Math.sin(s.feintT * 9) * .6 : 0;
    O.coneG.rotation.y = s.feintT > 0 ? s.feintT * 12 : 0;
    const ev = s.ev && s.ev.type;
    let lean = 0;
    if (ev === 'tug') lean = .14 + Math.sin(s.t * 20) * .02;
    if (ev === 'sneeze') lean = s.ev.stage === 0 ? .12 * (1 - s.ev.t / 1.6) : -.18 * Math.max(0, s.ev.t / .7);
    if (s.feintT > 0) lean = -.08;
    O.vb.rotation.z = lean; O.vb.position.y = Math.abs(Math.sin(s.t * 3)) * .03;
    O.head.scale.setScalar(ev === 'sneeze' && s.ev.stage === 1 ? .95 : .82);
    // 腕と棒
    O.vb.updateMatrixWorld(true);
    vSh.set(.38, 1.5, .05); O.vb.localToWorld(vSh);
    vHand.set(.75, 1.02, .55); O.vb.localToWorld(vHand);
    placeLimb(O.armR, vSh, vHand, .08);
    vCone.set(cx, -.5, 0);
    placeLimb(O.stick, vHand, vCone, .03);
    vSh.set(-.38, 1.5, .05); O.vb.localToWorld(vSh); tmpV2.set(-.62, 1.15 + Math.sin(s.t * 8) * .04, .3); O.vb.localToWorld(tmpV2);
    placeLimb(O.armL, vSh, tmpV2, .08); O.bell.position.copy(tmpV2).add(tmpV.set(0, .05, .1));
    setLabel(O.vSay, s.vendorSay || '');

    // アイスの色
    const fl = s.iceColor || '#fffaf0';
    iceC.set(fl).lerp(c2.set('#ffb3c6'), clamp((s.T - .5) * 1.6, 0, .8));
    if (ev === 'fever') iceC.setHSL((s.t * .6) % 1, .8, .78);
    if (ev === 'sun') iceC.lerp(c2.set('#fff3a8'), .3);
    O.iceMat.color.copy(iceC);
    // のびる部分
    const showIce = !catching && s.P > 1;
    O.ice.visible = showIce;
    let hy = tip + .14;
    if (catching) hy = s.phase === 'grab' ? .95 - (1 - Math.max(0, s.grabT) / .55) * .7 : .95 + Math.sin(s.t * 4) * .04;
    if (showIce) updateIce(s, tip, cx);
    if (s.snapT > 0) { const sp = 1.2 - s.snapT; hy += sp * sp * 14; }
    const shake = (!REDUCE && s.T > .7 && s.snapT <= 0) ? (Math.random() - .5) * .05 * s.T : 0;
    O.hand.position.set(shake, hy, 0);
    O.handB.rotation.x = .38 + (catching && s.phase === 'catch' ? -.2 : 0);

    // カラス・宇宙ゴミ
    let ci = 0, ri = 0;
    for (const b of s.birds || []) {
      if (b.rock) { const r = O.rocks[ri++]; if (!r) continue; r.visible = true; r.position.set(b.x, b.y, b.z); r.rotation.set(s.t * 2 + b.ph, s.t * 3, 0); }
      else { const c = O.crows[ci++]; if (!c) continue; c.visible = true; c.position.set(b.x, b.y, b.z); c.scale.set(b.vx > 0 ? 1.2 : -1.2, 1.2, 1.2); flapCrow(c, s.t * 18 + b.ph); }
    }
    for (; ci < O.crows.length; ci++) O.crows[ci].visible = false;
    for (; ri < O.rocks.length; ri++) O.rocks[ri].visible = false;
    // トッピング
    let ii = 0;
    for (const it of s.items || []) { const sp = O.items[ii++]; if (!sp) continue; sp.visible = it.life > 1 || Math.floor(it.life * 8) % 2 === 0; setEmoji(sp, it.kind); sp.position.set(it.x, it.y, it.z); sp.material.rotation = Math.sin(s.t * 3 + it.x) * .25; }
    for (; ii < O.items.length; ii++) O.items[ii].visible = false;
    // UFO
    O.ufo.visible = ev === 'ufo';
    if (O.ufo.visible) {
      const e = s.ev; O.ufo.position.set(e.x, e.y, e.z); O.ufo.rotation.y = s.t * 2; O.ufo.rotation.z = Math.sin(s.t * 3) * .08;
      O.ufo.userData.lights.forEach((l, i) => l.material.color.set((i + Math.floor(s.t * 8)) % 2 ? '#ffe066' : '#ff5fa2'));
      const bm = O.ufo.userData.beam; bm.visible = !e.gone;
      if (bm.visible) { O.ufo.updateMatrixWorld(true); tmpV.set(0, tip - .3, 0); O.ufo.worldToLocal(tmpV); const len = Math.max(.1, -tmpV.y); bm.scale.set(1, len, 1); bm.position.set(0, -len / 2, 0); bm.material.opacity = .22 + Math.sin(s.t * 14) * .06; }
    }
    // 横切る飛行機
    O.evPlane.visible = ev === 'plane';
    if (O.evPlane.visible) { const e = s.ev; O.evPlane.position.set(e.x, e.y, .3); O.evPlane.rotation.set(0, e.vx > 0 ? 0 : Math.PI, Math.sin(s.t * 2) * .05); }
    // 日差し
    O.sunS.visible = ev === 'sun';
    if (O.sunS.visible) { O.sunS.position.set(cam.position.x + 2.4, cam.position.y + 1.6, cam.position.z - 6); O.sunS.material.rotation = s.t * .5; }
    for (const d of O.drops) {
      if (d.position.y < tip - 8 || d.position.y < -1) { if (ev === 'sun' && Math.random() < dt * 4) { d.position.set((Math.random() - .5) * .2, tip - .3 - Math.random() * 1.5, (Math.random() - .5) * .2); d.userData.v = 0; } else d.position.y = -99; }
      else { d.userData.v += 9 * dt; d.position.y -= d.userData.v * dt; }
    }
    // リング：通ったら消える
    O.rings.forEach((g, i) => { const passed = s.ringPassed && s.ringPassed[i]; const sc = passed ? Math.max(0, g.scale.x - dt * 3) : 1 + Math.sin(s.t * 3 + i) * .04; g.scale.setScalar(sc || .0001); g.visible = sc > .01; g.rotation.y = s.t * .8; });
    O.ghosts.forEach((g) => { g.visible = !demo; });

    R.render(scene, cam);
  }

  function project(x, y, z) {
    tmpV.set(x, y, z).project(cam);
    return { x: (tmpV.x + 1) / 2 * W.w, y: (1 - tmpV.y) / 2 * W.h, behind: tmpV.z > 1 };
  }
  function resize() {
    if (!R) return;
    const p = R.domElement.parentNode; if (!p) return;
    const w = p.clientWidth || 1, h = p.clientHeight || 1; W.w = w; W.h = h;
    R.setSize(w, h, false); cam.aspect = w / h; cam.fov = cam.aspect < .8 ? 62 : 50; cam.updateProjectionMatrix();
  }
  function attach(el) {
    if (!R) return;
    if (R.domElement.parentNode !== el) el.insertBefore(R.domElement, el.firstChild);
    resize(); snapCam = true;
  }
  function init(o) {
    Object.assign(o, {}); K = o.K; TIP0 = o.TIP0; pOf = o.pOf; lenOf = o.lenOf; MOON = o.MOON; REDUCE = !!o.reduce;
    try {
      const cv = document.createElement('canvas'); cv.className = 'cv3';
      R = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.outputEncoding = T.sRGBEncoding;
      build();
      return true;
    } catch (e) { console.warn('3D init failed', e); R = null; return false; }
  }

  window.W3N = { init, attach, resize, render, project, setRings, setGhosts, reset: () => { snapCam = true; }, get canvas() { return R && R.domElement; } };
})();
