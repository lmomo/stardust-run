/* =========================================================================
 *  星尘穿梭 / Stardust Run
 *  纯静态 Three.js 小游戏 —— 霓虹隧道中的低多边形飞船
 * ========================================================================= */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ----------------------------- 常量配置 ------------------------------- */
const TUBE_R = 4.2;          // 隧道半径
const PLAY_R = 3.45;         // 飞船活动半径
const CAM_Z = 12;            // 相机到飞船平面的距离
const SHIP_R = 0.45;         // 飞船碰撞半径
const SPEED_MIN = 16;        // 起始速度（单位/秒）
const SPEED_MAX = 58;        // 最高速度
const SPEED_RAMP = 1.35;     // 每秒加速
const ORB_SCORE = 10;
const GAP_HALF = 0.52;       // 通道缺口半角（弧度）
const SAVE_KEY = 'stardust-run-best';

/* 霓虹配色 */
const COLORS = {
  cyan: 0x35e6ff,
  magenta: 0xff4fd8,
  violet: 0x8b5cff,
  amber: 0xffc84a,
  lime: 0x7dff9b,
};

/* ----------------------------- 状态 --------------------------------- */
const state = {
  phase: 'menu',            // menu | playing | over
  score: 0,
  best: 0,
  speed: SPEED_MIN,
  elapsed: 0,
  distance: 0,
  orbs: 0,
  nextSpawn: 34,
  lastGapAngle: 0,
  shake: 0,
};

function loadBest() {
  try {
    const v = Number(localStorage.getItem(SAVE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem(SAVE_KEY, String(v));
  } catch (e) {
    /* 隐私模式下忽略 */
  }
}
state.best = loadBest();

/* ----------------------------- DOM ---------------------------------- */
const canvas = document.getElementById('scene');
const elScore = document.getElementById('score');
const elBest = document.getElementById('best');
const elSpeed = document.getElementById('speed');
const elTip = document.getElementById('tip');
const elHint = document.getElementById('hint');
const startScreen = document.getElementById('startScreen');
const overScreen = document.getElementById('overScreen');
const finalScore = document.getElementById('finalScore');
const finalBest = document.getElementById('finalBest');
const newRecord = document.getElementById('newRecord');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

/* --------------------------- 渲染器 / 场景 ---------------------------- */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040c);
scene.fog = new THREE.FogExp2(0x06070f, 0.017);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 420);
camera.position.set(0, 0, CAM_Z);
camera.lookAt(0, 0, -6);

/* 灯光 */
scene.add(new THREE.HemisphereLight(0x3a4f9c, 0x120a22, 1.5));
const shipLight = new THREE.PointLight(0x7ce4ff, 45, 34, 2);

/* ------------------------- 后期处理 (Bloom) -------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.72,   // strength
  0.6,    // radius
  0.82    // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

/* --------------------------- 工具函数 -------------------------------- */
function neon(hex, boost = 2.2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(boost),
  });
}

function makeGlowTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const GLOW_TEX = makeGlowTexture();

function glowSprite(hex, scale, opacity = 0.9) {
  const mat = new THREE.SpriteMaterial({
    map: GLOW_TEX,
    color: new THREE.Color(hex),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(scale, scale, 1);
  return sp;
}

/* --------------------------- 隧道内壁贴图 ---------------------------- */
function makeWallTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#121a3c';
  ctx.fillRect(0, 0, s, s);

  // 网格
  ctx.strokeStyle = 'rgba(120,105,235,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0.5); ctx.lineTo(s, 0.5);
  ctx.moveTo(0.5, 0); ctx.lineTo(0.5, s);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(60,175,245,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
  ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
  ctx.stroke();

  // 随机霓虹小段
  const colors = ['#35e6ff', '#ff4fd8', '#8b5cff'];
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.55 + Math.random() * 0.45;
    ctx.lineWidth = 3 + Math.random() * 4;
    const horiz = Math.random() > 0.5;
    const p = Math.floor(Math.random() * 4) * (s / 4);
    const len = s / 4;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(p, 6); ctx.lineTo(p + len, 6); }
    else { ctx.moveTo(6, p); ctx.lineTo(6, p + len); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 46);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/* ----------------------------- 隧道 ---------------------------------- */
const tunnel = new THREE.Group();
scene.add(tunnel);

{
  const wallGeo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, 340, 40, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    map: makeWallTexture(),
    color: 0xffffff,
    side: THREE.BackSide,
    fog: true,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.z = -140;
  tunnel.add(wall);

  // 纵向霓虹线
  const linePts = [];
  const LINES = 18;
  for (let i = 0; i < LINES; i++) {
    const a = (i / LINES) * Math.PI * 2;
    const x = Math.cos(a) * TUBE_R * 0.985;
    const y = Math.sin(a) * TUBE_R * 0.985;
    linePts.push(new THREE.Vector3(x, y, 40), new THREE.Vector3(x, y, -280));
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(COLORS.violet).multiplyScalar(1.1),
    transparent: true,
    opacity: 0.5,
    fog: true,
  });
  tunnel.add(new THREE.LineSegments(lineGeo, lineMat));
}

/* 隧道环（循环移动，营造速度感） */
const RING_COUNT = 16;
const RING_SPACING = 9;
const ringGeo = new THREE.TorusGeometry(TUBE_R * 0.995, 0.05, 4, 40);
const ringMats = [neon(COLORS.cyan, 1.7), neon(COLORS.magenta, 1.4), neon(COLORS.violet, 1.4)];
const rings = [];
for (let i = 0; i < RING_COUNT; i++) {
  const mesh = new THREE.Mesh(ringGeo, ringMats[i % 3]);
  mesh.position.z = 10 - i * RING_SPACING;
  mesh.rotation.z = i * 0.7;
  scene.add(mesh);
  rings.push(mesh);
}

/* --------------------------- 星尘粒子 -------------------------------- */
function createDust(count, spread, size, color, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread * 2;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 2;
    pos[i * 3 + 2] = -Math.random() * 140 + 8;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const dust = createDust(600, 6.2, 0.085, 0x9fdcff, 0.9);

/* 速度线（拉伸线段） */
const STREAKS = 260;
const streakGeo = new THREE.BufferGeometry();
const streakPos = new Float32Array(STREAKS * 6);
for (let i = 0; i < STREAKS; i++) {
  const x = (Math.random() - 0.5) * 11;
  const y = (Math.random() - 0.5) * 11;
  const z = -Math.random() * 140 + 8;
  const len = 0.6 + Math.random() * 2.4;
  streakPos.set([x, y, z, x, y, z - len], i * 6);
}
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streaks = new THREE.LineSegments(
  streakGeo,
  new THREE.LineBasicMaterial({
    color: new THREE.Color(COLORS.cyan).multiplyScalar(1.4),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  })
);
streaks.frustumCulled = false;
scene.add(streaks);

/* ----------------------------- 飞船 ---------------------------------- */
const ship = new THREE.Group();
scene.add(ship);

{
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x4a63c8,
    emissive: 0x1b2f78,
    roughness: 0.4,
    metalness: 0.4,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xbfe4ff,
    emissive: new THREE.Color(COLORS.cyan).multiplyScalar(0.8),
    roughness: 0.3,
    metalness: 0.5,
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.35, 5), bodyMat);
  body.rotation.x = -Math.PI / 2;
  body.position.z = -0.15;
  ship.add(body);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 5), trimMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.45;
  ship.add(tail);

  const wingGeo = new THREE.BoxGeometry(1.15, 0.08, 0.5);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(s * 0.58, 0, 0.16);
    wing.rotation.z = s * 0.22;
    wing.rotation.y = s * -0.16;
    ship.add(wing);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.55), trimMat);
    tip.position.set(s * 1.12, 0.02, 0.2);
    ship.add(tip);
  }

  const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), neon(COLORS.cyan, 1.8));
  cockpit.position.set(0, 0.19, -0.34);
  ship.add(cockpit);

  const flame = glowSprite(COLORS.cyan, 1.1, 0.95);
  flame.position.set(0, 0, 0.78);
  ship.add(flame);
  ship.userData.flame = flame;

  shipLight.position.set(0, 0.6, 0.6);
  ship.add(shipLight);
}

/* --------------------------- 障碍 / 能量球 ---------------------------- */
const GATE_COLORS = [COLORS.magenta, COLORS.cyan, COLORS.violet, COLORS.lime];
const gateMats = GATE_COLORS.map((c) => neon(c, 2.4));

const gateGeo = new THREE.TorusGeometry(TUBE_R, 0.14, 6, 72, Math.PI * 2 - GAP_HALF * 2);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockEdgeGeo = new THREE.EdgesGeometry(rockGeo);
const rockMat = new THREE.MeshStandardMaterial({
  color: 0x3d1150,
  emissive: new THREE.Color(COLORS.magenta).multiplyScalar(0.32),
  roughness: 0.35,
  metalness: 0.3,
  flatShading: true,
});
const rockEdgeMat = new THREE.LineBasicMaterial({
  color: new THREE.Color(COLORS.magenta).multiplyScalar(1.9),
});
const orbGeo = new THREE.IcosahedronGeometry(0.4, 0);
const orbMat = neon(COLORS.amber, 2.6);

const gatePool = [];
const rockPool = [];
const orbPool = [];
const activeGates = [];
const activeRocks = [];
const activeOrbs = [];

function makeGate() {
  const mesh = new THREE.Mesh(gateGeo, gateMats[0]);
  const glow = glowSprite(GATE_COLORS[0], 3.2, 0.45);
  mesh.add(glow);
  scene.add(mesh);
  const item = { mesh, angle: 0, glow };
  gatePool.push(item);
  return item;
}
function makeRock() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rockGeo, rockMat));
  g.add(new THREE.LineSegments(rockEdgeGeo, rockEdgeMat));
  scene.add(g);
  const item = { mesh: g, r: 1 };
  rockPool.push(item);
  return item;
}
function makeOrb() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(orbGeo, orbMat));
  const glow = glowSprite(COLORS.amber, 1.6, 0.85);
  g.add(glow);
  scene.add(g);
  const item = { mesh: g, glow, spin: Math.random() * Math.PI };
  orbPool.push(item);
  return item;
}

const takeGate = () => gatePool.pop() || makeGate();
const takeRock = () => rockPool.pop() || makeRock();
const takeOrb = () => orbPool.pop() || makeOrb();

/* ----------------------------- 爆炸粒子 ------------------------------ */
const BURST = 70;
const burstGeo = new THREE.BufferGeometry();
const burstPos = new Float32Array(BURST * 3);
const burstVel = new Float32Array(BURST * 3);
burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
const burstPoints = new THREE.Points(
  burstGeo,
  new THREE.PointsMaterial({
    color: new THREE.Color(COLORS.cyan).multiplyScalar(1.7),
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
burstPoints.frustumCulled = false;
scene.add(burstPoints);
let burstLife = 0;

function explode(x, y) {
  burstLife = 1;
  burstPoints.material.opacity = 1;
  for (let i = 0; i < BURST; i++) {
    burstPos[i * 3] = x;
    burstPos[i * 3 + 1] = y;
    burstPos[i * 3 + 2] = 0;
    const a = Math.random() * Math.PI * 2;
    const b = (Math.random() - 0.5) * 1.4;
    const s = 3 + Math.random() * 9;
    burstVel[i * 3] = Math.cos(a) * s;
    burstVel[i * 3 + 1] = Math.sin(a) * s;
    burstVel[i * 3 + 2] = b * s;
  }
  burstGeo.attributes.position.needsUpdate = true;
}

/* --------------------------- 输入控制 -------------------------------- */
const target = new THREE.Vector2(0, 0);   // 飞船目标位置
const keys = new Set();
const pointer = { active: false, id: -1, x: 0, y: 0, tx: 0, ty: 0 };

function clampTarget() {
  const len = target.length();
  if (len > PLAY_R) {
    target.multiplyScalar(PLAY_R / len);
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar'].includes(k)) {
    e.preventDefault();
  }
  keys.add(k);
  if ((k === ' ' || k === 'spacebar' || k === 'enter') && state.phase !== 'playing') {
    if (state.phase === 'menu') startGame();
    else restartGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

/* 触屏 / 鼠标拖动跟随 */
if (window.matchMedia('(pointer: coarse)').matches) {
  elHint.classList.add('show');
  setTimeout(() => elHint.classList.remove('show'), 6000);
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'playing') return;
  pointer.active = true;
  pointer.id = e.pointerId;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.tx = target.x;
  pointer.ty = target.y;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  const scale = (TUBE_R * 2) / Math.max(window.innerWidth, 320);
  target.x = pointer.tx + (e.clientX - pointer.x) * scale;
  target.y = pointer.ty - (e.clientY - pointer.y) * scale;
  clampTarget();
});
function endPointer(e) {
  if (pointer.active && e.pointerId === pointer.id) {
    pointer.active = false;
    pointer.id = -1;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* --------------------------- 游戏流程 -------------------------------- */
function resetWorld() {
  for (const g of activeGates) { g.mesh.visible = false; gatePool.push(g); }
  for (const r of activeRocks) { r.mesh.visible = false; rockPool.push(r); }
  for (const o of activeOrbs) { o.mesh.visible = false; orbPool.push(o); }
  activeGates.length = 0;
  activeRocks.length = 0;
  activeOrbs.length = 0;

  rings.forEach((ring, i) => {
    ring.position.z = 10 - i * RING_SPACING;
  });

  state.speed = SPEED_MIN;
  state.elapsed = 0;
  state.distance = 0;
  state.orbs = 0;
  state.nextSpawn = 34;
  state.lastGapAngle = 0;
  state.shake = 0;
  target.set(0, 0);
  ship.position.set(0, 0, 0);
  ship.rotation.set(0, 0, 0);
  ship.visible = true;
  burstLife = 0;
  burstPoints.material.opacity = 0;
  updateHUD();
}

function startGame() {
  resetWorld();
  state.phase = 'playing';
  startScreen.classList.remove('show');
  overScreen.classList.remove('show');
  elTip.style.opacity = '0';
  elHint.style.opacity = '0';
}

function endGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'over';
  const score = Math.floor(state.score);
  if (score > state.best) {
    state.best = score;
    saveBest(score);
    newRecord.classList.add('show');
  } else {
    newRecord.classList.remove('show');
  }
  finalScore.textContent = String(score);
  finalBest.textContent = String(state.best);
  elBest.textContent = String(state.best);
  explode(ship.position.x, ship.position.y);
  ship.visible = false;
  state.shake = 1;
  overScreen.classList.add('show');
}

function restartGame() {
  overScreen.classList.remove('show');
  startGame();
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restartGame);

/* --------------------------- 生成逻辑 -------------------------------- */
function randAngle() {
  return Math.random() * Math.PI * 2;
}

function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function spawnGate(z) {
  const g = takeGate();
  let angle = randAngle();
  let guard = 0;
  while (Math.abs(angleDelta(angle, state.lastGapAngle)) < 0.9 && guard < 12) {
    angle = randAngle();
    guard++;
  }
  state.lastGapAngle = angle;
  g.angle = angle;
  g.prevZ = z;
  g.mesh.visible = true;
  g.mesh.position.set(0, 0, z);
  g.mesh.rotation.z = angle + GAP_HALF;
  const ci = Math.floor(Math.random() * GATE_COLORS.length);
  g.mesh.material = gateMats[ci];
  g.glow.material.color.setHex(GATE_COLORS[ci]);
  activeGates.push(g);
  return g;
}

function spawnRock(z) {
  const r = takeRock();
  const a = randAngle();
  const rad = 0.8 + Math.random() * 2.3;
  const scale = 0.45 + Math.random() * 0.65;
  r.mesh.visible = true;
  r.mesh.position.set(Math.cos(a) * rad, Math.sin(a) * rad, z);
  r.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  r.mesh.scale.setScalar(scale);
  r.r = scale * 0.92;
  r.prevZ = z;
  activeRocks.push(r);
  return r;
}

function spawnOrb(z, angle, radius) {
  const o = takeOrb();
  o.mesh.visible = true;
  o.mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
  o.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  o.spin = Math.random() * Math.PI * 2;
  o.prevZ = z;
  activeOrbs.push(o);
  return o;
}

const SPAWN_Z = -120;

function spawnWave() {
  const difficulty = Math.min(1, state.elapsed / 70);
  const roll = Math.random();

  if (roll < 0.55) {
    const g = spawnGate(SPAWN_Z);
    spawnOrb(SPAWN_Z + 26, g.angle, 2.4);
    if (Math.random() < 0.4 + difficulty * 0.3) {
      spawnOrb(SPAWN_Z + 40, g.angle + 0.25, 2.9);
    }
  } else if (roll < 0.82) {
    const count = 2 + Math.floor(Math.random() * 2 + difficulty * 2);
    for (let i = 0; i < count; i++) {
      spawnRock(SPAWN_Z + Math.random() * 22);
    }
    if (Math.random() < 0.6) spawnOrb(SPAWN_Z + 30, randAngle(), 1.2 + Math.random() * 1.6);
  } else {
    const g = spawnGate(SPAWN_Z);
    spawnRock(SPAWN_Z + 14);
    spawnOrb(SPAWN_Z + 24, g.angle, 2.2);
  }
}

/* --------------------------- HUD ------------------------------------ */
let hudTimer = 0;
function updateHUD() {
  elScore.textContent = String(Math.floor(state.score));
  elBest.textContent = String(state.best);
  elSpeed.textContent = (state.speed / SPEED_MIN).toFixed(1) + 'x';
}

/* --------------------------- 尺寸适配 -------------------------------- */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / Math.max(h, 1);

  const halfW = 4.65;
  const halfH = Math.max(4.65, halfW / Math.max(aspect, 0.35));
  const fov = 2 * Math.atan(halfH / CAM_Z) * (180 / Math.PI);
  camera.fov = Math.min(fov, 92);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
resize();

/* --------------------------- 主循环 ---------------------------------- */
const clock = new THREE.Clock();
const KEY_SPEED = 4.8;

function update(dt) {
  // ---- 键盘移动 ----
  let kx = 0;
  let ky = 0;
  if (keys.has('arrowleft') || keys.has('a')) kx -= 1;
  if (keys.has('arrowright') || keys.has('d')) kx += 1;
  if (keys.has('arrowup') || keys.has('w')) ky += 1;
  if (keys.has('arrowdown') || keys.has('s')) ky -= 1;
  if (kx !== 0 || ky !== 0) {
    const len = Math.hypot(kx, ky);
    target.x += (kx / len) * KEY_SPEED * dt;
    target.y += (ky / len) * KEY_SPEED * dt;
    clampTarget();
  }

  // ---- 速度提升 ----
  state.speed = Math.min(SPEED_MAX, SPEED_MIN + state.elapsed * SPEED_RAMP);
  const v = state.speed * dt;

  // ---- 飞船移动（平滑跟随） ----
  const follow = 1 - Math.exp(-11 * dt);
  const prevX = ship.position.x;
  const prevY = ship.position.y;
  ship.position.x += (target.x - ship.position.x) * follow;
  ship.position.y += (target.y - ship.position.y) * follow;
  ship.rotation.z += (-(ship.position.x - prevX) * 6 - ship.rotation.z) * Math.min(1, dt * 9);
  ship.rotation.x += ((ship.position.y - prevY) * 6 - ship.rotation.x) * Math.min(1, dt * 9);

  const flame = ship.userData.flame;
  const pulse = 0.9 + Math.random() * 0.35;
  flame.scale.set(1.15 * pulse, 1.15 * pulse, 1);
  flame.material.opacity = 0.75 + Math.random() * 0.25;

  // ---- 世界推进 ----
  state.elapsed += dt;
  state.distance += v;
  state.score = state.distance * 0.5 + state.orbs * ORB_SCORE;

  // 隧道环
  for (const ring of rings) {
    ring.position.z += v;
    ring.rotation.z += dt * 0.35;
    if (ring.position.z > 12) ring.position.z -= RING_COUNT * RING_SPACING;
  }

  // 星尘
  const dpos = dust.geometry.attributes.position;
  for (let i = 0; i < dpos.count; i++) {
    let z = dpos.getZ(i) + v * 0.85;
    if (z > 10) {
      z -= 140;
      dpos.setX(i, (Math.random() - 0.5) * 12.4);
      dpos.setY(i, (Math.random() - 0.5) * 12.4);
    }
    dpos.setZ(i, z);
  }
  dpos.needsUpdate = true;

  // 速度线
  const spos = streakGeo.attributes.position;
  for (let i = 0; i < STREAKS; i++) {
    const o = i * 6;
    let z = spos.getZ(o) + v * 1.15;
    if (z > 10) {
      z -= 140;
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 10;
      spos.setX(o, x);
      spos.setX(o + 3, x);
      spos.setY(o, y);
      spos.setY(o + 3, y);
    }
    spos.setZ(o, z);
    spos.setZ(o + 3, z - (0.6 + Math.random() * 2.4));
  }
  spos.needsUpdate = true;

  // ---- 生成 ----
  state.nextSpawn -= v;
  if (state.nextSpawn <= 0) {
    spawnWave();
    const difficulty = Math.min(1, state.elapsed / 70);
    state.nextSpawn = (30 - difficulty * 14) + Math.random() * 8;
  }

  // ---- 障碍移动与碰撞 ----
  const sx = ship.position.x;
  const sy = ship.position.y;
  const shipAngle = Math.atan2(sy, sx);

  for (let i = activeGates.length - 1; i >= 0; i--) {
    const g = activeGates[i];
    g.mesh.position.z += v;
    const crossed = g.prevZ < 0.9 && g.mesh.position.z > -0.9;
    g.prevZ = g.mesh.position.z;
    if (g.mesh.position.z > 14) {
      g.mesh.visible = false;
      gatePool.push(g);
      activeGates.splice(i, 1);
      continue;
    }
    if (crossed) {
      const d = Math.abs(angleDelta(shipAngle, g.angle));
      if (d > GAP_HALF - 0.17) {
        endGame();
        return;
      }
    }
  }

  for (let i = activeRocks.length - 1; i >= 0; i--) {
    const r = activeRocks[i];
    r.mesh.position.z += v;
    r.mesh.rotation.x += dt * 1.1;
    r.mesh.rotation.y += dt * 0.8;
    const crossed = r.prevZ < r.r + 0.7 && r.mesh.position.z > -(r.r + 0.7);
    r.prevZ = r.mesh.position.z;
    if (r.mesh.position.z > 14) {
      r.mesh.visible = false;
      rockPool.push(r);
      activeRocks.splice(i, 1);
      continue;
    }
    if (crossed) {
      const dx = sx - r.mesh.position.x;
      const dy = sy - r.mesh.position.y;
      if (dx * dx + dy * dy < (r.r + SHIP_R) * (r.r + SHIP_R)) {
        endGame();
        return;
      }
    }
  }

  for (let i = activeOrbs.length - 1; i >= 0; i--) {
    const o = activeOrbs[i];
    o.mesh.position.z += v;
    o.spin += dt * 2.4;
    o.mesh.rotation.y = o.spin;
    o.mesh.rotation.x = o.spin * 0.6;
    o.glow.scale.setScalar(1.5 + Math.sin(o.spin * 3) * 0.25);
    const crossed = o.prevZ < 1.1 && o.mesh.position.z > -1.1;
    o.prevZ = o.mesh.position.z;
    if (o.mesh.position.z > 14) {
      o.mesh.visible = false;
      orbPool.push(o);
      activeOrbs.splice(i, 1);
      continue;
    }
    if (crossed) {
      const dx = sx - o.mesh.position.x;
      const dy = sy - o.mesh.position.y;
      if (dx * dx + dy * dy < 1.1 * 1.1) {
        state.orbs += 1;
        o.mesh.visible = false;
        orbPool.push(o);
        activeOrbs.splice(i, 1);
      }
    }
  }
}

function render(dt) {
  // 相机轻微跟随 + 震动
  const shakeAmt = state.shake * state.shake * 0.45;
  const jx = (Math.random() - 0.5) * shakeAmt;
  const jy = (Math.random() - 0.5) * shakeAmt;
  camera.position.x += (ship.position.x * 0.1 - camera.position.x) * Math.min(1, dt * 3);
  camera.position.y += (-ship.position.y * 0.08 - camera.position.y) * Math.min(1, dt * 3);
  camera.position.z = CAM_Z;
  camera.position.x += jx;
  camera.position.y += jy;
  camera.lookAt(ship.position.x * 0.16, ship.position.y * 0.12, -6);

  // 爆炸粒子
  if (burstLife > 0) {
    burstLife -= dt * 1.1;
    burstPoints.material.opacity = Math.max(0, burstLife);
    for (let i = 0; i < BURST; i++) {
      burstPos[i * 3] += burstVel[i * 3] * dt;
      burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
      burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
      burstVel[i * 3] *= 0.96;
      burstVel[i * 3 + 1] *= 0.96;
      burstVel[i * 3 + 2] *= 0.96;
    }
    burstGeo.attributes.position.needsUpdate = true;
    if (burstLife <= 0) state.shake = 0;
  }

  composer.render();
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (state.phase === 'playing') {
    update(dt);
    hudTimer += dt;
    if (hudTimer > 0.08) {
      hudTimer = 0;
      updateHUD();
    }
  } else {
    // 待机 / 结束时的环境动画
    const v = 6 * dt;
    for (const ring of rings) {
      ring.position.z += v;
      ring.rotation.z += dt * 0.3;
      if (ring.position.z > 12) ring.position.z -= RING_COUNT * RING_SPACING;
    }
    const spos = streakGeo.attributes.position;
    for (let i = 0; i < STREAKS; i++) {
      const o = i * 6;
      let z = spos.getZ(o) + v * 0.6;
      if (z > 10) z -= 140;
      spos.setZ(o, z);
      spos.setZ(o + 3, z);
    }
    spos.needsUpdate = true;

    if (state.phase === 'menu') {
      const t = performance.now() * 0.001;
      ship.position.x = Math.sin(t * 0.6) * 0.55;
      ship.position.y = Math.cos(t * 0.8) * 0.32;
      ship.rotation.set(ship.position.y * 0.3, t * 0.25, -ship.position.x * 0.4);
    } else if (state.phase === 'over') {
      ship.rotation.y += dt * 0.6;
    }
  }

  render(dt);
}

renderer.setAnimationLoop(loop);

/* 首屏 */
elBest.textContent = String(state.best);
updateHUD();

/* 调试用：?auto=1 直接开局（不影响正常玩法） */
if (/(\?|&)auto=1/.test(location.search)) {
  startGame();
}
