// 遅刻ダッシュの3D表示（Three.js）。ゲームの進行（update）はそのままで、見た目だけを3Dで描く
// 座標：x＝左右(m)、y＝高さ(m)、z＝-距離(m)（前に進むほど z が小さくなる）
(function () {
  if (!window.THREE) return;
  const T = THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  const LANE_M = 1.15, WALL = 2.9;
  const STAIR0 = 4, STAIR1 = 40, TOP = 7.2; // ホーム(高さ7.2m)から階段を下りて地上へ
  const gy = (d) => (d < STAIR0 ? TOP : d < STAIR1 ? TOP * (1 - (d - STAIR0) / (STAIR1 - STAIR0)) : 0);
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SIG = { signal: 178, crossEnd: 192 };

  // ===== 共有の形と色 =====
  const G = { box: new T.BoxGeometry(1, 1, 1), sph: new T.SphereGeometry(.5, 16, 12), cyl: new T.CylinderGeometry(.5, .5, 1, 16), cone: new T.ConeGeometry(.5, 1, 12), disc: new T.CircleGeometry(.5, 24) };
  const MC = {};
  const mat = (c, o) => { const k = c + (o ? JSON.stringify(o) : ''); return MC[k] || (MC[k] = new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); };
  function part(geo, c, sx, sy, sz, x, y, z, parent, shadow) {
    const m = new T.Mesh(G[geo] || geo, typeof c === 'string' ? mat(c) : c);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (shadow) m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function canvasTex(w, h, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
    return t;
  }
  const texRepeat = (base, rx, ry) => { const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; };
  function label(text, bg, fg, w = 2, font = 64) {
    const tex = canvasTex(512, 160, (x, W, H) => {
      x.fillStyle = bg; x.beginPath(); x.roundRect(4, 4, W - 8, H - 8, 30); x.fill();
      x.fillStyle = fg; x.font = `900 ${font}px "M PLUS Rounded 1c", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 4);
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: true })); sp.scale.set(w, w * 160 / 512, 1);
    return sp;
  }
  function signBoard(text, bg, fg, w, h) {
    const tex = canvasTex(1024, Math.round(1024 * h / w), (x, W, H) => {
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
      x.fillStyle = fg; x.font = `900 ${Math.round(H * .5)}px "M PLUS Rounded 1c", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 4);
    });
    return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex }));
  }

  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  // ===== テクスチャ =====
  const TX = {};
  function makeTextures() {
    TX.tile = canvasTex(256, 256, (x, W) => { x.fillStyle = '#d9d4ca'; x.fillRect(0, 0, W, W); x.strokeStyle = '#b9b2a6'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, W); x.stroke(); x.beginPath(); x.moveTo(0, i * 64); x.lineTo(W, i * 64); x.stroke(); } });
    TX.walk = canvasTex(256, 256, (x, W) => { x.fillStyle = '#c9cfd4'; x.fillRect(0, 0, W, W); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#c1c8ce' : '#cfd5da'; x.fillRect(i * 64 + (j % 2) * 32, j * 32, 62, 30); } });
    TX.marble = canvasTex(256, 256, (x, W) => { const g = x.createLinearGradient(0, 0, W, W); g.addColorStop(0, '#f4efe6'); g.addColorStop(1, '#e6dfd2'); x.fillStyle = g; x.fillRect(0, 0, W, W); x.strokeStyle = 'rgba(160,150,135,.35)'; x.lineWidth = 2; x.strokeRect(0, 0, W, W); for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(hash(i) * W, 0); x.bezierCurveTo(hash(i + 3) * W, W * .3, hash(i + 5) * W, W * .7, hash(i + 7) * W, W); x.stroke(); } });
    TX.wall = canvasTex(256, 256, (x, W) => { x.fillStyle = '#e8e3d9'; x.fillRect(0, 0, W, W); x.strokeStyle = '#d3ccbf'; x.lineWidth = 2; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(W, i * 32); x.stroke(); } for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, W); x.stroke(); } });
    TX.asphalt = canvasTex(256, 256, (x, W) => { x.fillStyle = '#3f434a'; x.fillRect(0, 0, W, W); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${hash(i) * .08})`; x.fillRect(hash(i + 1) * W, hash(i + 2) * W, 2, 2); } });
    TX.win = [0, 1, 2, 3].map((v) => canvasTex(256, 256, (x, W) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, W);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const lit = hash(v * 10 + r * 2 + c) > .55;
        const g = x.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, lit ? '#ffe7a8' : '#7d93ad'); g.addColorStop(1, lit ? '#f5c46a' : '#4b5f78');
        x.fillStyle = g; x.fillRect(18 + c * 128, 22 + r * 128, 92, 86);
        x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(18 + c * 128, 22 + r * 128, 30, 86);
        x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(14 + c * 128, 108 + r * 128, 100, 6);
      }
    }));
  }

  // ===== 人（ローポリ） =====
  const SKIN = '#f0c49c';
  function makePerson(o = {}) {
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const suit = o.suit || '#3b4660', pants = o.pants || '#262c3a', hair = o.hair || '#222', sh = true;
    const P = { root, body };
    for (const side of [-1, 1]) {
      const hip = new T.Group(); hip.position.set(side * .1, .82, 0); body.add(hip);
      part('box', pants, .15, .82, .16, 0, -.41, 0, hip, sh);
      part('box', o.shoe || '#151515', .16, .09, .28, 0, -.8, .05, hip, sh);
      P[side < 0 ? 'legL' : 'legR'] = hip;
    }
    const torso = new T.Group(); torso.position.y = .82; body.add(torso); P.torso = torso;
    part('box', suit, .44, .6, .25, 0, .33, 0, torso, sh);
    for (const s of [-1, 1]) part('sph', suit, .2, .2, .25, s * .2, .6, 0, torso, sh);
    part('box', suit, .44, .14, .27, 0, -.02, 0, torso);
    part('box', '#1b2233', .015, .5, .005, 0, .32, -.128, torso);
    part('box', o.shirt || '#f4f4f4', .14, .2, .02, 0, .5, .135, torso);
    if (o.tie !== false) part('box', o.tieColor || '#c0392b', .06, .3, .02, 0, .38, .14, torso);
    for (const side of [-1, 1]) {
      const sh2 = new T.Group(); sh2.position.set(side * .28, .58, 0); torso.add(sh2);
      part('box', suit, .12, .56, .13, 0, -.27, 0, sh2, sh);
      part('sph', SKIN, .11, .11, .11, 0, -.58, 0, sh2);
      P[side < 0 ? 'armL' : 'armR'] = sh2;
    }
    const head = new T.Group(); head.position.y = .72; torso.add(head); P.head = head;
    part('cyl', SKIN, .1, .08, .1, 0, -.02, 0, head);
    part('sph', SKIN, .25, .28, .26, 0, .14, 0, head, sh);
    if (o.hair !== 'bald') { part('sph', hair, .27, .2, .28, 0, .22, -.01, head); part('sph', hair, .265, .22, .2, 0, .14, -.06, head); }
    else { part('sph', '#4a3a2c', .265, .12, .27, 0, .1, -.02, head); }
    // 顔（目・口）
    part('sph', '#1a1a1a', .035, .045, .02, -.055, .16, .125, head); part('sph', '#1a1a1a', .035, .045, .02, .055, .16, .125, head);
    P.mouth = part('sph', '#7a2020', .06, o.panic ? .05 : .015, .02, 0, .06, .125, head);
    if (o.cap) { part('cyl', o.cap, .28, .08, .28, 0, .3, 0, head); part('box', '#111', .2, .02, .12, 0, .27, .14, head); }
    if (o.crown) { const cr = part('cyl', mat('#ffd34d', { emissive: '#5a4500' }), .2, .12, .2, 0, .33, 0, head); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; part('cone', mat('#ffd34d', { emissive: '#5a4500' }), .05, .09, .05, Math.cos(a) * .09, .43, Math.sin(a) * .09, head); } P.crown = cr; }
    root.userData.P = P;
    return root;
  }
  // 歩く・走るアニメ
  function animPerson(p, ph, amp, opt = {}) {
    const P = p.userData.P, s = Math.sin(ph);
    P.legL.rotation.x = s * amp; P.legR.rotation.x = -s * amp;
    if (!opt.armsFree) { P.armL.rotation.x = -s * amp * .9; P.armR.rotation.x = s * amp * .9; P.armL.rotation.z = 0; P.armR.rotation.z = 0; }
    P.body.position.y = Math.abs(Math.cos(ph)) * .05 * (amp > .1 ? 1 : 0);
  }

  // ===== 障害物の形 =====
  function makePigeons() {
    const g = new T.Group(), list = [];
    for (let i = 0; i < 3; i++) {
      const b = new T.Group(); b.position.set((i - 1) * .32, 0, (i % 2) * .25 - .1); g.add(b);
      part('sph', '#8d939b', .26, .2, .34, 0, .14, 0, b, true);
      part('sph', '#6f7780', .14, .14, .14, 0, .27, .14, b); part('cone', '#e0a030', .03, .07, .03, 0, .27, .23, b).rotation.x = Math.PI / 2;
      part('sph', '#5c8a7a', .16, .06, .12, 0, .22, .1, b);
      list.push(b);
    }
    g.userData.birds = list; return g;
  }
  function makeDog() {
    const g = new T.Group();
    part('box', '#b07a45', .28, .26, .6, 0, .32, 0, g, true); part('box', '#b07a45', .24, .22, .26, 0, .48, .34, g, true);
    part('box', '#7a5230', .08, .12, .06, -.08, .62, .32, g); part('box', '#7a5230', .08, .12, .06, .08, .62, .32, g);
    part('box', '#222', .08, .06, .06, 0, .46, .48, g);
    const legs = []; for (const [x, z] of [[-.1, .2], [.1, .2], [-.1, -.2], [.1, -.2]]) { const l = new T.Group(); l.position.set(x, .2, z); g.add(l); part('box', '#9a6a3a', .07, .2, .07, 0, -.1, 0, l); legs.push(l); }
    const tail = part('box', '#9a6a3a', .05, .05, .25, 0, .45, -.38, g); tail.rotation.x = -.6;
    g.userData.legs = legs; g.userData.tail = tail; return g;
  }
  function makeBike() {
    const g = new T.Group();
    const wheel = new T.TorusGeometry(.32, .035, 8, 24);
    for (const z of [-.5, .5]) { const w = new T.Mesh(wheel, mat('#222')); w.rotation.y = Math.PI / 2; w.position.set(0, .34, z); w.castShadow = true; g.add(w); }
    part('box', '#2f8de0', .05, .05, 1, 0, .6, 0, g); part('box', '#2f8de0', .05, .45, .05, 0, .5, -.2, g); part('box', '#888', .5, .04, .04, 0, .95, .45, g);
    const rider = makePerson({ suit: '#e8783a', pants: '#2b3a55', tie: false, shirt: '#e8783a', hair: '#5a3a20' });
    rider.position.set(0, .05, -.1); g.add(rider);
    const P = rider.userData.P; P.legL.rotation.x = -1.1; P.legR.rotation.x = -.6; P.armL.rotation.x = -1.2; P.armR.rotation.x = -1.2; P.torso.rotation.x = .25;
    g.userData.rider = rider; return g;
  }
  function makeCart() {
    const g = new T.Group();
    part('box', '#5a6068', .8, .06, 1.1, 0, .14, 0, g, true);
    for (const [x, z] of [[-.32, .45], [.32, .45], [-.32, -.45], [.32, -.45]]) part('cyl', '#222', .1, .1, .1, x, .06, z, g);
    part('box', '#5a6068', .7, .04, .04, 0, 1.0, -.55, g); part('box', '#5a6068', .04, .85, .04, -.33, .6, -.55, g); part('box', '#5a6068', .04, .85, .04, .33, .6, -.55, g);
    for (let i = 0; i < 3; i++) { const b = part('box', '#c89a5a', .62 - i * .06, .32, .5, (i - 1) * .02, .34 + i * .32, .05, g, true); part('box', '#e9d6a6', .63 - i * .06, .04, .51, (i - 1) * .02, .34 + i * .32, .05, g); b.rotation.y = (hash(i) - .5) * .2; }
    return g;
  }
  function makeCoffee() {
    const g = new T.Group(), c = new T.Group(); g.add(c);
    part('cyl', '#ffffff', .18, .3, .18, 0, 0, 0, c, true); part('cyl', '#8a5a35', .19, .12, .19, 0, 0, 0, c); part('cyl', '#3a2a20', .2, .04, .2, 0, .16, 0, c);
    const ring = new T.Mesh(new T.TorusGeometry(.32, .03, 8, 32), new T.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: .8 })); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.cup = c; g.userData.ring = ring; return g;
  }
  function makePuddle() {
    const m = new T.Mesh(G.disc, new T.MeshPhongMaterial({ color: '#6fa6d6', transparent: true, opacity: .75, shininess: 120, specular: '#ffffff' }));
    m.rotation.x = -Math.PI / 2; m.scale.set(1.3, .9, 1); m.position.y = .015; m.receiveShadow = true;
    const g = new T.Group(); g.add(m); return g;
  }
  function makeSnowman() {
    const g = new T.Group();
    part('sph', '#ffffff', .8, .75, .8, 0, .38, 0, g, true); part('sph', '#ffffff', .55, .52, .55, 0, .95, 0, g, true);
    part('sph', '#111', .07, .07, .04, -.09, 1.02, .25, g); part('sph', '#111', .07, .07, .04, .09, 1.02, .25, g);
    const n = part('cone', '#f07a20', .07, .25, .07, 0, .95, .33, g); n.rotation.x = Math.PI / 2;
    part('cyl', '#c0392b', .4, .3, .4, 0, 1.3, 0, g); part('box', '#c0392b', .55, .06, .1, 0, .7, .26, g);
    return g;
  }
  function makePapers() {
    const g = new T.Group(), list = [];
    const pm = new T.MeshLambertMaterial({ color: '#ffffff', side: T.DoubleSide });
    for (let i = 0; i < 4; i++) { const p = new T.Mesh(new T.PlaneGeometry(.32, .42), pm); p.castShadow = true; g.add(p); list.push(p); }
    g.userData.papers = list; return g;
  }
  function makeGate(closed) {
    const g = new T.Group();
    const flap = new T.Group(); g.add(flap);
    for (const s of [-1, 1]) part('box', closed ? '#e8432f' : '#3ecf80', .3, .32, .04, s * .22, .55, 0, flap);
    const disp = label(closed ? '×' : '○', '#111', closed ? '#ff5b47' : '#3ee08a', .55, 120); disp.position.set(0, 1.35, 0); g.add(disp);
    g.userData.flap = flap; return g;
  }

  function buildObstacle(o) {
    let m;
    switch (o.type) {
      case 'down': m = makePerson({ suit: ['#3b4660', '#4a4a4a', '#5a4a3a', '#2f3e5c'][Math.floor(hash(o.d) * 4)], hair: hash(o.d + 1) > .7 ? '#7a5a3a' : '#1c1c1c' }); break;
      case 'phone': { m = makePerson({ suit: ['#7a8fa8', '#a86a5a', '#5a8a6a', '#8a7aa8'][Math.floor(hash(o.d) * 4)], tie: false, shirt: '#eee', hair: hash(o.d + 2) > .5 ? '#3a2a1a' : '#111', pants: '#334' });
        const P = m.userData.P; P.armR.rotation.x = -1.3; P.armR.userData.fix = true; part('box', '#111', .08, .14, .02, 0, -.6, .07, P.armR); P.head.rotation.x = .45; break; }
      case 'tissue': { m = makePerson({ suit: '#e85a8a', tie: false, shirt: '#fff', hair: '#5a3a1a', pants: '#333' }); const P = m.userData.P; P.armR.rotation.x = -1.4; part('box', '#ffffff', .14, .06, .1, 0, -.62, .02, P.armR); m.add(at(label('ティッシュどうぞ〜', '#ffffff', '#e8432f', 1.4, 52), 0, 2.1, 0)); break; }
      case 'guard': m = makePerson({ suit: '#2c3e6b', pants: '#1f2b4a', cap: '#2c3e6b', tie: false, shirt: '#b8c6e0' }); break;
      case 'boss': { m = makePerson({ suit: '#5a5a5a', pants: '#404040', hair: '#8a8a8a', tieColor: '#6a1b9a' }); m.scale.setScalar(1.1); const t = label('部長', '#e8432f', '#fff', .9, 90); t.position.set(0, 2.15, 0); m.add(t); break; }
      case 'couple': { m = new T.Group(); const a = makePerson({ suit: '#d98a5a', tie: false, shirt: '#fff', hair: '#3a2a1a' }), b = makePerson({ suit: '#8ab0d9', tie: false, shirt: '#fff', hair: '#1a1a1a' });
        a.position.x = -LANE_M / 2; b.position.x = LANE_M / 2; m.add(a, b); a.userData.P.armR.rotation.z = .9; b.userData.P.armL.rotation.z = -.9; a.userData.P.armR.userData.fix = b.userData.P.armL.userData.fix = true;
        m.userData.people = [a, b]; m.add(at(label('♥', 'rgba(0,0,0,0)', '#ff5b8a', .7, 120), 0, 2, 0)); break; }
      case 'dog': { m = new T.Group(); const owner = makePerson({ suit: '#7a9a5a', tie: false, shirt: '#fff', hair: '#555' }), dog = makeDog(); m.add(owner, dog); m.userData.owner = owner; m.userData.dog = dog;
        const leash = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#e8432f' })); m.add(leash); m.userData.leash = leash; break; }
      case 'bike': m = makeBike(); break;
      case 'cart': m = makeCart(); break;
      case 'pigeon': m = makePigeons(); break;
      case 'coffee': m = makeCoffee(); break;
      case 'puddle': m = makePuddle(); break;
      case 'snowman': m = makeSnowman(); break;
      case 'paper': m = makePapers(); break;
      case 'gate': m = makeGate(o.closed); break;
      default: m = makePerson({});
    }
    m.userData.hitT = 0;
    return m;
  }

  // ===== コース（動かない物） =====
  function buildCourse(scene, W) {
    const S = new T.Group(); scene.add(S);
    const floor = (x0, x1, d0, d1, y, tex, rx, col) => {
      const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, d1 - d0), new T.MeshLambertMaterial({ color: col || '#ffffff', map: tex ? texRepeat(tex, rx || (x1 - x0) / 2, (d1 - d0) / 2) : null }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, -(d0 + d1) / 2); m.receiveShadow = true; S.add(m); return m;
    };
    const wallTex = (w, h) => texRepeat(TX.wall, w / 2, h / 2);
    // ホーム（電車つき）
    floor(-WALL, WALL, -30, STAIR0, TOP, TX.tile);
    part('box', '#f2c200', .3, .02, 34, -WALL + .25, TOP + .01, -(-30 + STAIR0) / 2, S);
    const train = new T.Group(); train.position.set(-WALL - 1.7, TOP, 12); S.add(train);
    part('box', '#e9edf0', 3, 3.3, 22, 0, 1.75, 0, train); part('box', '#2e9e5b', 3.02, .35, 22.02, 0, 1.2, 0, train);
    for (let i = 0; i < 6; i++) part('box', '#6c8aa8', 3.04, .9, 1.4, 0, 2.3, -9 + i * 3.6, train);
    // 階段
    for (let d = STAIR0; d < STAIR1; d++) {
      const y = gy(d + 1);
      const step = part('box', '#d2ccc1', WALL * 2, .2, 1, 0, y - .1 + .2, -(d + .5), S); step.receiveShadow = true;
      part('box', '#8a7f70', WALL * 2, .03, .06, 0, y + .2, -(d + .03), S);
      part('box', '#bdb6a8', WALL * 2, TOP, 1, 0, y - TOP / 2 - .001, -(d + .5), S);
    }
    // 手すり
    for (const s of [-1, 1]) { const r = part('box', '#c8a060', .08, .08, Math.hypot(STAIR1 - STAIR0, TOP), s * (WALL - .15), TOP / 2 + 1, -(STAIR0 + STAIR1) / 2, S); r.rotation.x = -Math.atan2(TOP, STAIR1 - STAIR0); }
    // 駅の壁・天井
    for (const s of [-1, 1]) {
      const w = new T.Mesh(G.box, new T.MeshLambertMaterial({ map: wallTex(88, 12) })); w.scale.set(.3, 12, 88); w.position.set(s * (WALL + .15), 6, -(58 - 30) / 2 - 1); w.receiveShadow = true; S.add(w);
    }
    for (let d = -30; d < 58; d += 2) {
      const y = Math.max(gy(d), gy(d + 2)) + 3.8;
      part('box', '#ebe7df', WALL * 2 + .4, .2, 2.05, 0, y, -(d + 1), S);
      if ((d + 30) % 6 === 0) { const l = part('box', new T.MeshBasicMaterial({ color: '#fffbe8' }), 1.2, .05, .4, 0, y - .12, -(d + 1), S); }
    }
    // 柱
    for (let d = 44; d < 58; d += 9) for (const s of [-1, 1]) part('box', '#b7b0a3', .5, 3.8, .5, s * 2.5, 1.9, -d, S);
    // 駅の案内板
    const sg1 = signBoard('↓ 改札口・出口', '#1d3d6e', '#ffd34d', 3, .6); sg1.position.set(0, gy(14) + 3.2, -14); S.add(sg1);
    const sg2 = signBoard('とんまと駅　TONMATO', '#ffffff', '#1d3d6e', 3.4, .7); sg2.position.set(WALL - .01, TOP + 2.2, -2); sg2.rotation.y = -Math.PI / 2; S.add(sg2);
    const sg3 = signBoard('出口 EXIT →', '#ffd34d', '#1d1d1d', 2.4, .5); sg3.position.set(0, 3.1, -47); S.add(sg3);
    // 改札の機械（レーンの間）
    floor(-WALL, WALL, STAIR1, 58, 0, TX.tile);
    for (const x of [-1.725, -.575, .575, 1.725]) { part('box', '#9aa4b1', .32, 1.0, 1.4, x, .5, -52, S, true); part('box', '#c4ccd6', .34, .06, 1.42, x, 1.02, -52, S); part('box', '#3b82f6', .2, .02, .2, x, 1.06, -51.6, S); }
    // 歩道・ビル街
    floor(-WALL, WALL, 58, 176, 0, TX.walk);
    floor(-WALL, WALL, 194, 222, 0, TX.walk);
    floor(-60, 60, 176, 194, -.02, TX.asphalt, 30);
    for (let k = -4; k <= 4; k++) floor(k * .6 - .2, k * .6 + .2, 177.5, 192.5, 0, null, 1, '#f3f3f3');
    floor(-WALL, WALL, 175.6, 176, .01, null, 1, '#ffffff');
    // 点字ブロック
    floor(-WALL + .2, -WALL + .5, 58, 176, .005, null, 1, '#e8c000'); floor(-WALL + .2, -WALL + .5, 194, 222, .005, null, 1, '#e8c000');
    // 道路の車線
    for (const z of [180, 190]) floor(-60, 60, z - .06, z + .06, -.01, null, 1, '#d8d8d8');
    const pal = ['#d9cfc2', '#c8d2dc', '#e3d6c8', '#b9c6d3', '#d6c2b0', '#cfd9cf', '#e8d8c8', '#c0c8d0'];
    const addBuildings = (d0, d1, n0) => {
      let d = d0, n = n0;
      while (d < d1) {
        const len = Math.min(d1 - d, 8 + hash(n) * 7);
        for (const s of [-1, 1]) {
          const k = n * 2 + (s > 0 ? 1 : 0), h = 9 + hash(k) * 22, dep = 10, col = pal[Math.floor(hash(k + 9) * pal.length)];
          const b = part('box', col, dep, h, len - .3, s * (WALL + .3 + dep / 2), h / 2, -(d + len / 2), S); b.receiveShadow = true;
          const fac = new T.Mesh(new T.PlaneGeometry(len - .3, h - 3.4), new T.MeshLambertMaterial({ color: col, map: texRepeat(TX.win[k % 4], (len - .3) / 4, (h - 3.4) / 3.2) }));
          fac.position.set(s * (WALL + .29), 3.4 + (h - 3.4) / 2, -(d + len / 2)); fac.rotation.y = -s * Math.PI / 2; S.add(fac);
          // 1階のお店（明るい）
          const lit = hash(k + 4) > .45;
          const shop = new T.Mesh(new T.PlaneGeometry(len - 1.2, 2.4), new T.MeshBasicMaterial({ color: lit ? '#ffe2a0' : '#d8e6f0' }));
          shop.position.set(s * (WALL + .28), 1.4, -(d + len / 2)); shop.rotation.y = -s * Math.PI / 2; S.add(shop);
          const aw = part('box', ['#e8432f', '#2f7de1', '#2e9e5b', '#f2a900'][k % 4], .9, .1, len - 1, s * (WALL - .1), 2.85, -(d + len / 2), S); aw.rotation.z = s * .25;
          // 後ろの高いビル（遠景）
          if (hash(k + 20) > .4) { const h2 = 30 + hash(k + 21) * 45; part('box', '#b8c3cf', 14, h2, len, s * (WALL + 16 + hash(k + 22) * 10), h2 / 2, -(d + len / 2), S); }
        }
        d += len; n++;
      }
    };
    addBuildings(58, 176, 1); addBuildings(194, 222, 40);
    // 交差点の向こう側の建物（横から見える）
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const h = 12 + hash(i * 7 + s) * 30; part('box', pal[(i + (s > 0 ? 3 : 0)) % pal.length], 9, h, 12, s * (8 + i * 12), h / 2, -170.5 + 0, S); part('box', pal[(i + 5) % pal.length], 9, h * .8, 12, s * (8 + i * 12), h * .4, -200, S); }
    // 街路樹・街灯
    for (let d = 64; d < 222; d += 12) {
      if (d > 172 && d < 196) continue;
      for (const s of [-1, 1]) {
        const x = s * (WALL - .35);
        part('cyl', '#6b4a2b', .14, 1.8, .14, x, .9, -d, S, true);
        part('sph', '#4f9a5a', 1.3, 1.2, 1.3, x, 2.4, -d, S, true); part('sph', '#62b06c', .9, .8, .9, x - s * .2, 2.8, -d + .2, S, true);
      }
      const lx = (d / 12) % 2 ? -1 : 1;
      part('cyl', '#5a6068', .08, 4.2, .08, lx * (WALL - .2), 2.1, -(d + 6), S); part('box', '#fffbe8', .5, .08, .25, lx * (WALL - .45), 4.15, -(d + 6), S);
    }
    // 信号機（右側）
    const sig = new T.Group(); sig.position.set(WALL - .3, 0, -(SIG.signal - .4)); S.add(sig);
    part('cyl', '#5a6068', .1, 3.4, .1, 0, 1.7, 0, sig); part('box', '#222', .4, .8, .2, 0, 3.0, .05, sig);
    const red = new T.MeshBasicMaterial({ color: '#ff3b30' }), grn = new T.MeshBasicMaterial({ color: '#34d27a' });
    const lr = part('cyl', red, .26, .04, .26, 0, 3.2, .16, sig); lr.rotation.x = Math.PI / 2;
    const lg = part('cyl', grn, .26, .04, .26, 0, 2.8, .16, sig); lg.rotation.x = Math.PI / 2;
    W.sigRed = red; W.sigGrn = grn;
    // 信号待ちのあいだ横切る車
    W.cars = [];
    for (let k = 0; k < 4; k++) {
      const car = new T.Group(), col = ['#e8432f', '#2f7de1', '#f2f2f2', '#f2a900'][k];
      part('box', col, 4, .8, 1.8, 0, .6, 0, car, true); part('box', col, 2.2, .6, 1.6, -.2, 1.25, 0, car, true); part('box', '#7da0c4', 2.24, .4, 1.62, -.2, 1.3, 0, car);
      for (const [x, z] of [[-1.3, .85], [1.3, .85], [-1.3, -.85], [1.3, -.85]]) { const w = part('cyl', '#1a1a1a', .6, .25, .6, x, .3, z, car); w.rotation.x = Math.PI / 2; }
      car.userData.dyn = true; car.position.set(0, 0, -(k % 2 ? 187.5 : 182.5)); car.userData.dir = k % 2 ? -1 : 1; car.userData.off = k * 23; S.add(car); W.cars.push(car);
    }
    // 会社のビル（正面）
    const fa = '#d7dde3';
    part('box', fa, 30, 40, 1, -WALL - 15, 20, -222, S); part('box', fa, 30, 40, 1, WALL + 15, 20, -222, S); part('box', fa, WALL * 2, 36, 1, 0, 22, -222, S);
    const fac = new T.Mesh(new T.PlaneGeometry(60, 36), new T.MeshLambertMaterial({ color: fa, map: texRepeat(TX.win[2], 15, 11) })); fac.position.set(0, 22, -221.45); S.add(fac);
    const logo = signBoard('株式会社とんまと', '#1d2433', '#ffffff', 5.6, 1); logo.position.set(0, 4.6, -221.4); S.add(logo);
    part('box', '#9fb4c8', WALL * 2, .2, 1.6, 0, 4, -221.2, S);
    // ロビー
    const lob = new T.Mesh(new T.PlaneGeometry(WALL * 2, 38), new T.MeshPhongMaterial({ map: texRepeat(TX.marble, 3, 19), shininess: 80, specular: '#555555' }));
    lob.rotation.x = -Math.PI / 2; lob.position.set(0, 0, -241); lob.receiveShadow = true; S.add(lob);
    for (const s of [-1, 1]) part('box', '#efe8da', .3, 4.6, 38, s * (WALL + .15), 2.3, -241, S);
    part('box', '#f6f1e8', WALL * 2 + .6, .2, 38, 0, 4.6, -241, S);
    for (let d = 225; d < 260; d += 4) part('box', new T.MeshBasicMaterial({ color: '#fffbe8' }), 2, .04, .6, 0, 4.48, -d, S);
    part('box', '#d9d1c1', WALL * 2 + .6, 4.6, .3, 0, 2.3, -259.8, S);
    // 受付と観葉植物
    part('box', '#8a6a4a', .8, 1.05, 2.4, -WALL + .5, .52, -228, S, true); part('box', '#f4efe6', .9, .06, 2.5, -WALL + .5, 1.07, -228, S);
    for (const d of [226, 234, 248]) { part('cyl', '#7a5a3a', .45, .5, .45, WALL - .45, .25, -d, S, true); part('sph', '#3f8a4a', .9, 1.2, .9, WALL - .45, 1.1, -d, S, true); }
    // エレベーター（左右の壁）
    W.elev = [];
    for (const s of [-1, 1]) {
      part('box', '#b9bec6', .1, 2.6, 2.2, s * (WALL - .05), 1.3, -240, S);
      const inner = part('box', new T.MeshBasicMaterial({ color: '#fff3c4' }), .05, 2.3, 1.6, s * (WALL - .08), 1.15, -240, S);
      const d1 = part('box', '#8c96a3', .06, 2.3, .8, s * (WALL - .12), 1.15, -239.6, S), d2 = part('box', '#8c96a3', .06, 2.3, .8, s * (WALL - .12), 1.15, -240.4, S); d1.userData.dyn = d2.userData.dyn = inner.userData.dyn = true;
      const ind = label('▲', '#1d2433', '#ffd34d', .5, 110); ind.position.set(s * (WALL - .2), 2.75, -240); S.add(ind);
      W.elev.push({ d1, d2, ind, inner });
    }
    const elSign = signBoard('エレベーター →', '#2f6fe4', '#ffffff', 1.8, .36); elSign.position.set(0, 3.4, -234); S.add(elSign);
    // タイムカード
    const tc = new T.Group(); tc.position.set(0, 0, -259.4); S.add(tc);
    part('box', '#e9e9e9', .7, 1.0, .3, 0, 1.3, 0, tc, true);
    const tcs = signBoard('タイムカード', '#2f6fe4', '#ffffff', .62, .2); tcs.position.set(0, 1.62, .16); tc.add(tcs);
    part('box', '#1d2433', .4, .2, .02, 0, 1.3, .16, tc);
    const sign2 = signBoard('始業 9:00　遅刻厳禁', '#e8432f', '#ffffff', 3, .5); sign2.position.set(0, 3.3, -259.6); S.add(sign2);
    mergeStatic(S);
    return S;
  }
  function mergeStatic(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map(), olds = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
      const key = o.material.uuid + (o.castShadow ? 'c' : '');
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
      buckets.get(key).list.push(o); olds.push(o);
    });
    for (const o of olds) o.parent.remove(o);
    for (const { mat, cast, list } of buckets.values()) {
      const parts = list.map((m) => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrixWorld); return g; });
      const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let k = 0;
      for (const g of parts) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, k * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, k * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, k * 2); k += c; g.dispose(); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const m = new T.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; m.matrixAutoUpdate = false; root.add(m);
    }
  }

  // ===== 世界 =====
  class World {
    constructor(canvas, opt = {}) {
      this.canvas = canvas; this.hero = !!opt.hero;
      const r = this.r = new T.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: false, powerPreference: 'high-performance' });
      r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
      const sc = this.scene = new T.Scene();
      this.cam = new T.PerspectiveCamera(72, 1, .1, 400);
      this.hemi = new T.HemisphereLight('#dfefff', '#8a7a68', .95); sc.add(this.hemi);
      const sun = this.sun = new T.DirectionalLight('#fff1d6', 1.25); sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024); const sc2 = sun.shadow.camera; sc2.left = -9; sc2.right = 9; sc2.top = 12; sc2.bottom = -12; sc2.near = 1; sc2.far = 60; sun.shadow.bias = -.0008;
      sc.add(sun); sc.add(sun.target);
      if (!TX.tile) makeTextures();
      this.course = buildCourse(sc, this);
      this.player = null; this.charId = null; this.obsRef = null; this.objs = []; this.camY = null; this.lastT = 0; this.weather = null;
      this.fx = new T.Group(); sc.add(this.fx);
    }
    setSize(w, h, dpr) { this.r.setPixelRatio(Math.min(dpr || 1, this.hero ? 1.25 : 1.5)); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.w = w; this.h = h; }
    setWeather(w) {
      if (this.weather === w) return; this.weather = w;
      const sky = { sunny: ['#7fb4f0', '#cfe3f7', '#ffe2b8'], rain: ['#5f6b7a', '#9aa6b2', '#b9c3cc'], snow: ['#9fb0c2', '#d8e1ea', '#eef3f7'], wind: ['#6fa8e8', '#c4dcf4', '#f2e6c8'] }[w] || ['#7fb4f0', '#cfe3f7', '#ffe2b8'];
      this.scene.background = canvasTex(4, 256, (x, W, H) => { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[0]); g.addColorStop(.6, sky[1]); g.addColorStop(1, sky[2]); x.fillStyle = g; x.fillRect(0, 0, W, H); });
      this.scene.background.wrapS = this.scene.background.wrapT = T.ClampToEdgeWrapping;
      this.scene.fog = new T.Fog(sky[1], w === 'rain' ? 28 : w === 'snow' ? 30 : 45, w === 'rain' || w === 'snow' ? 85 : 140);
      this.sun.intensity = w === 'sunny' || w === 'wind' ? 1.25 : .55; this.hemi.intensity = w === 'sunny' || w === 'wind' ? .95 : 1.05;
      // 雨・雪の粒
      this.fx.clear(); this.drops = null;
      if (w === 'rain') {
        const n = 900, pos = new Float32Array(n * 6);
        for (let i = 0; i < n; i++) { const x = (Math.random() - .5) * 18, y = Math.random() * 14, z = -Math.random() * 40; pos.set([x, y, z, x - .04, y - .5, z], i * 6); }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        this.drops = { kind: 'rain', n, geo, mesh: new T.LineSegments(geo, new T.LineBasicMaterial({ color: '#cfdcf0', transparent: true, opacity: .55 })) };
        this.fx.add(this.drops.mesh);
      } else if (w === 'snow') {
        const n = 700, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) pos.set([(Math.random() - .5) * 18, Math.random() * 14, -Math.random() * 40], i * 3);
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        this.drops = { kind: 'snow', n, geo, mesh: new T.Points(geo, new T.PointsMaterial({ color: '#ffffff', size: .09, transparent: true, opacity: .95 })) };
        this.fx.add(this.drops.mesh);
      }
    }
    setChar(C) {
      if (this.charId === C.id) return; this.charId = C.id;
      if (this.player) this.scene.remove(this.player);
      const p = makePerson({ suit: C.suit[1], pants: '#1e2638', hair: C.hair === 'bald' ? 'bald' : C.hair, crown: C.crown, panic: true });
      const P = p.userData.P;
      if (C.bag === 'brief') { const b = part('box', '#5b3b22', .1, .3, .4, 0, -.72, 0, P.armR, true); P.bag = b; }
      if (C.bag === 'backpack') part('box', '#2b2b2b', .38, .44, .2, 0, .36, -.23, P.torso, true);
      // はためくネクタイ（猛ダッシュ中だけ肩越しに見える）
      const tie = new T.Group(); tie.position.set(0, .52, .14); P.torso.add(tie); part('box', '#e8432f', .07, .42, .02, 0, .2, 0, tie); P.tie = tie; tie.visible = false;
      this.player = p; this.scene.add(p);
    }
    syncObstacles(S) {
      if (this.obsRef === S.obs) return;
      for (const o of this.objs) this.scene.remove(o.m);
      this.objs = S.obs.map((o) => { const m = buildObstacle(o); this.scene.add(m); return { o, m }; });
      this.obsRef = S.obs;
    }
    // 画面上の位置（2Dの重ね描き用）
    project(x, y, z) { const v = new T.Vector3(x, y, z).project(this.cam); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, ok: v.z < 1 }; }
    playerHead() { return this.player ? this.project(this.player.position.x, this.player.position.y + 1.9, this.player.position.z) : null; }

    render(S, ctx) {
      const dt = Math.max(0, Math.min(.05, S.t - this.lastT)); this.lastT = S.t;
      this.setWeather(S.weather); this.setChar(S.char); this.syncObstacles(S);
      const LX = ctx.LANE_X, pxToM = ctx.pxToM;
      // プレイヤー
      const p = this.player, P = p.userData.P, d = S.d;
      const px = pxToM(S.x), crazy = S.dash > 0, run = S.speed > .5;
      const jh = S.jump > 0 ? Math.sin((1 - S.jump / ctx.JUMP_T) * Math.PI) * .75 : 0;
      p.position.set(px, gy(d) + jh, -d);
      p.rotation.set(0, Math.PI, 0);
      const lean = (LX[S.lane] - S.x) * -.004;
      p.rotation.z = -lean * 1.4 + (S.stun > 0 ? Math.sin(S.t * 30) * .25 : 0);
      if (S.stun > 0) p.rotation.y = Math.PI + Math.sin(S.t * 18) * .5;
      P.torso.rotation.x = crazy ? .38 + Math.sin(S.t * 31) * .08 : run ? .14 : 0;
      if (crazy) {
        const ph = S.step * 2.4;
        P.legL.rotation.x = Math.sin(ph) * 1.25; P.legR.rotation.x = -Math.sin(ph) * 1.25;
        P.armL.rotation.x = S.t * 26; P.armR.rotation.x = -S.t * 26 + Math.PI; P.armL.rotation.z = -.5; P.armR.rotation.z = .5;
        P.body.position.y = Math.abs(Math.cos(ph)) * .08;
        P.head.rotation.z = Math.sin(S.t * 40) * .2;
      } else {
        animPerson(p, S.step * 1.15, run ? .75 : 0); P.head.rotation.z = 0;
      }
      if (S.jump > 0) { P.legL.rotation.x = .9; P.legR.rotation.x = -.3; }
      P.tie.visible = crazy; if (crazy) P.tie.rotation.x = -2.3 + Math.sin(S.t * 40) * .35;
      P.mouth.scale.y = crazy || S.stun > 0 ? .07 : .03;
      if (P.crown) P.crown.rotation.y = S.t * 3;
      // 障害物
      for (const { o, m } of this.objs) {
        const z = o.d - d;
        const vis = z > -4 && z < 75 && !(o.type === 'coffee' && o.hit);
        m.visible = vis; if (!vis) continue;
        let x = pxToM(o.x == null ? LX[o.lane] : o.x);
        if (o.type === 'couple') x = pxToM((o.x == null ? LX[o.lane] : o.x) + 50);
        m.position.set(x, gy(o.d), -o.d);
        const moving = !!o.v || !!o.drift;
        const towardMe = (o.v || 0) < 0 || ['tissue', 'guard', 'boss', 'gate'].includes(o.type);
        if (o.hit) m.userData.hitT = Math.min(1, m.userData.hitT + dt * 3);
        const h = m.userData.hitT;
        switch (o.type) {
          case 'down': case 'phone': case 'tissue': case 'guard': case 'boss': {
            m.rotation.y = towardMe ? 0 : Math.PI;
            const P2 = m.userData.P;
            animPerson(m, S.t * 7 + o.d, moving ? .55 : 0, { armsFree: o.type === 'phone' || o.type === 'tissue' });
            if (o.type === 'phone' && moving) { P2.armL.rotation.x = -Math.sin(S.t * 7 + o.d) * .5; }
            if (o.type === 'boss' && !o.hit) { P2.armR.rotation.x = -.6 - Math.sin(S.t * 4) * .4; P2.armR.rotation.z = .3; }
            m.rotation.x = towardMe ? -h * 1.4 : h * 1.4; m.position.x += h * (x < px ? -.8 : .8);
            break;
          }
          case 'couple': { m.rotation.y = Math.PI; for (const q of m.userData.people) animPerson(q, S.t * 6 + o.d, .45, { armsFree: true }); m.rotation.x = h * .4; break; }
          case 'dog': {
            m.rotation.y = 0; const own = m.userData.owner, dog = m.userData.dog;
            own.rotation.y = Math.PI; animPerson(own, S.t * 6, .45);
            const dx = pxToM(LX[o.lane2] + ((o.x == null ? LX[o.lane] : o.x) - LX[o.lane])) - x;
            dog.position.set(dx, 0, -.3); dog.rotation.y = Math.PI; dog.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(S.t * 14 + i * 1.6) * .6)); dog.userData.tail.rotation.y = Math.sin(S.t * 18) * .6;
            const pts = m.userData.leash.geometry.attributes.position; pts.setXYZ(0, .28, .9, 0); pts.setXYZ(1, dx, .45, -.3 - .3); pts.needsUpdate = true;
            m.rotation.z = h * .3; break;
          }
          case 'bike': { m.rotation.y = 0; m.rotation.z = h * .9; break; }
          case 'cart': { m.rotation.y = Math.PI; m.rotation.z = h * .5; break; }
          case 'pigeon': { m.userData.birds.forEach((b, i) => { if (o.hit || o.jumped) { b.position.y = h * (2 + i * .6) + (o.jumped ? 1 : 0); b.rotation.x = -.6; } else { b.rotation.x = Math.max(0, Math.sin(S.t * 6 + i * 2)) * .5; b.position.y = 0; } }); break; }
          case 'coffee': { m.position.y += .55 + Math.sin(S.t * 4 + o.d) * .08; m.userData.cup.rotation.y = S.t * 2; m.userData.ring.rotation.z = S.t; m.userData.ring.scale.setScalar(1 + Math.sin(S.t * 6) * .08); break; }
          case 'paper': { m.userData.papers.forEach((pp, i) => { pp.position.set(Math.sin(S.t * 3 + i * 1.7 + o.d) * .5, 1.1 + Math.sin(S.t * 5 + i) * .35 + i * .1, Math.cos(S.t * 2 + i) * .3); pp.rotation.set(S.t * 4 + i, S.t * 3 + i * 2, S.t * 5); }); if (o.hit) m.visible = false; break; }
          case 'puddle': { m.children[0].material.opacity = o.hit ? .4 : .75; break; }
          case 'gate': { m.position.x = pxToM(LX[o.lane]); m.userData.flap.visible = !!o.closed; break; }
        }
      }
      // 信号・車
      const sigSt = ctx.signalState(S.t), on = sigSt === 'green' || (sigSt === 'blink' && Math.floor(S.t * 6) % 2 === 0);
      this.sigRed.color.set(sigSt === 'red' ? '#ff3b30' : '#3a1210'); this.sigGrn.color.set(on ? '#34d27a' : '#0f2a1a');
      for (const c of this.cars) { const active = sigSt === 'red'; c.visible = active && Math.abs(c.position.z + d) < 80; if (!active) continue; const x = ((S.t * 15 + c.userData.off) % 100) - 50; c.position.x = c.userData.dir * x; c.rotation.y = c.userData.dir > 0 ? 0 : Math.PI; }
      // エレベーター
      const open = ctx.elevatorOpen(S.t) && S.elevator === null;
      for (const e of this.elev) { const k = open ? .55 : 0; e.d1.position.z += ((-239.6 + k) - e.d1.position.z) * .2; e.d2.position.z += ((-240.4 - k) - e.d2.position.z) * .2; e.ind.material.opacity = open ? 1 : .35; }
      // カメラ
      const cy = gy(d) + 2.4;
      this.camY = this.camY == null ? cy : this.camY + (cy - this.camY) * Math.min(1, dt * 5);
      const cam = this.cam;
      if (this.hero) {
        const sway = Math.sin(S.t * .4);
        const side = px > .3 ? -1 : 1, camX = Math.max(-2.5, Math.min(2.5, px + side * (1.8 + sway * .3)));
        cam.position.set(camX, gy(d) + 1.45, -d - 3.1);
        cam.lookAt(px + .2, gy(d) + 1.05, -d + .3);
        cam.fov = 58;
      } else {
        const shake = S.stun > 0 ? .06 : crazy ? .02 : 0;
        cam.position.set(px * .45 + (Math.random() - .5) * shake, this.camY + (Math.random() - .5) * shake, -d + 3.6);
        cam.lookAt(px * .3, this.camY - 2.9, -d - 7);
        const fovT = crazy || S.boost > 0 ? 82 : 72; cam.fov += (fovT - cam.fov) * Math.min(1, dt * 6);
      }
      cam.updateProjectionMatrix();
      // 影は自分のまわりだけ
      this.sun.position.set(px + 6, gy(d) + 16, -d + 4); this.sun.target.position.set(px, gy(d), -d - 4);
      // 雨・雪
      const indoor = d < 58 || d >= 222;
      if (this.drops) {
        this.drops.mesh.visible = !indoor; this.drops.mesh.position.set(px, gy(d), -d);
        const a = this.drops.geo.attributes.position.array;
        if (this.drops.kind === 'rain') for (let i = 0; i < this.drops.n; i++) { const j = i * 6; a[j + 1] -= 22 * dt; a[j + 4] -= 22 * dt; if (a[j + 4] < 0) { a[j + 1] += 14; a[j + 4] += 14; } }
        else for (let i = 0; i < this.drops.n; i++) { const j = i * 3; a[j + 1] -= 1.6 * dt; a[j] += Math.sin(S.t + i) * .3 * dt; if (a[j + 1] < 0) a[j + 1] += 14; }
        this.drops.geo.attributes.position.needsUpdate = true;
      }
      this.r.render(this.scene, cam);
    }
  }
  window.Chikoku3D = {
    create(canvas, opt) { try { return new World(canvas, opt); } catch (e) { console.warn('3D off', e); return null; } },
  };
})();
