// 3D galaxy-robot renderer (Three.js). Replaces the old PixiJS iso scene.
// Public interface is unchanged so App.tsx keeps working:
//   new Scene(); await init(el); setState(s); setBuildMode(m); onPlace; onSelect
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import buildings from '@config/buildings.json';
import townhall from '@config/townhall.json';
import troops from '@config/troops.json';
import { sfx } from '../sfx';

const GRID = 48;            // tiles per side (matches server) — larger play area
const DEF: any = buildings;
const TH: any = townhall;
const TROOPS: any = troops;
const WALLTONE = [0x46e6ff, 0xbcff5e, 0xffd25e, 0xff8c3a, 0xff5cb0];  // Force Barrier colour by level 1-5

// ---- battle tuning ----
const TSPEED: Record<string, number> = { barbarian: 2.9, archer: 2.6, giant: 1.8, wizard: 2.2, dragon: 2.1 };
const TRANGE: Record<string, number> = { barbarian: 0.9, archer: 3.4, giant: 1.0, wizard: 3.0, dragon: 3.0 };
const TCOLOR: Record<string, number> = { barbarian: 0x46e6ff, archer: 0xbcff5e, giant: 0xff5cb0, wizard: 0xc98bff, dragon: 0xff6b5c };
const TROOP_FLY: Record<string, number> = { wizard: 0.95 };   // Mage floats; War Jet uses isAir (1.6)
const TROOP_NAME: Record<string, string> = { barbarian: 'Fighter', archer: 'Archer', wizard: 'Mage', giant: 'Titan', dragon: 'War Jet' };
const TROOP_HITS_AIR: Record<string, boolean> = { archer: true, wizard: true };   // ranged troops can hit air (War Jet); melee (Fighter/Titan) can't
const TROOP_FACE: Record<string, number> = { dragon: Math.PI };   // War Jet: rotate so its NOSE (front) points at the target
function troopCfg(t: string, level = 1) {
  const d = TROOPS[t] || {}; const lv = d.levels?.[String(level)] || d.levels?.['1'] || {};
  return { hp: lv.hp || 50, dps: lv.dps || 10, speed: TSPEED[t] || 2.4, range: TRANGE[t] || 1, isAir: !!d.isAir, prefersDefense: t === 'giant' };
}
const DSTATS: Record<string, any> = {
  cannon: { range: 7, rate: 0.8 },                    // Rail Cannon — THICK LASER beam, barrel aims at target (thicker per level)
  archer_tower: { range: 7.5, rate: 0.6 },            // Laser Turret — THICK LIGHTNING bolt (thicker per level)
  mortar: { range: 11, rate: 2, splash: 3.7 },        // Bomber Spire — round BOMB, WIDE blast radius (hits a big area)
};
const dDps = (b: any) => DEF[b.type]?.levels?.[String(b.level)]?.dps || 6;

// ---- optional GLB models (drop files in client/public/models/, else procedural meshes are used) ----
const MODEL_NAMES = [
  'town_hall', 'cannon', 'archer_tower', 'mortar', 'gold_mine', 'elixir_collector', 'army_camp', 'builders_hut', 'wall', 'gold_storage', 'elixir_storage',
  'troop_barbarian', 'troop_archer', 'troop_wizard', 'troop_giant', 'troop_dragon', 'worker',
  'tree', 'tree_b', 'rock', 'land',
];
const MODELS: Record<string, THREE.Object3D | null> = {};
const MODEL_ANIMS: Record<string, THREE.AnimationClip[]> = {};   // baked walk/idle clips, if the GLB has any
let modelsPromise: Promise<void> | null = null;
let MODELS_READY = false;          // true once all GLBs have loaded (or 404'd)
function preloadModels(): Promise<void> {
  if (modelsPromise) return modelsPromise;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  modelsPromise = Promise.all(MODEL_NAMES.map((n) => new Promise<void>((res) => {
    loader.load(`/models/${n}.glb`, (g) => { MODELS[n] = g.scene; MODEL_ANIMS[n] = g.animations || []; res(); }, undefined, () => { MODELS[n] = null; res(); });
  }))).then(() => { MODELS_READY = true; });
  return modelsPromise;
}

// ---- galaxy-robot palette (bright & readable) ----
const C = {
  space: 0x0c1430,        // dark blue-violet (not pure black, so silhouettes still read)
  floor: 0x152244,        // navy board — dark enough that colored buildings pop
  grid: 0x4ae8ff,         // bright cyan grid lines
  gridDim: 0x335f9c,      // visible dim grid
  body: 0x8f9ed6,         // fallback light blue-steel
  bodyDark: 0x46538a,     // platform / base
  steel: 0xc2cdeb,        // light steel for mechanical parts
  cyan: 0x46e6ff,
  magenta: 0xff5cb0,
  purple: 0xc98bff,
  lime: 0xbcff5e,
  ore: 0xffd25e,
  plasma: 0xd79bff,
};

// distinct vivid body color per building type → instantly readable
const BODY: Record<string, number> = {
  town_hall: 0x4f86e6,         // royal blue
  cannon: 0x8a96c0,            // steel blue
  archer_tower: 0x6f86d8,      // bright indigo
  mortar: 0x9a86c8,            // violet steel
  gold_mine: 0xe09236,         // orange
  elixir_collector: 0xc05ed8,  // magenta
  gold_storage: 0xeeb53a,      // amber gold
  elixir_storage: 0xab5ed8,    // purple
  army_camp: 0x2fc4a2,         // teal
  barracks: 0xe05f3a,          // red-orange
  builders_hut: 0xeccb3a,      // yellow
  wall: 0xaab6e0,              // light steel
};

const mat = (color: number, o: any = {}) =>
  new THREE.MeshStandardMaterial({
    color, metalness: o.metal ?? 0.35, roughness: o.rough ?? 0.55,
    emissive: new THREE.Color(o.emissive ?? 0x000000), emissiveIntensity: o.emI ?? 0,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1,
  });
const glow = (color: number, i = 1.3) => mat(color, { color, emissive: color, emI: i, metal: 0.15, rough: 0.35 });

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); e.position.set(x, y, z); e.castShadow = true; e.receiveShadow = true; return e;
};
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 24, x = 0, y = 0, z = 0) => {
  const e = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); e.position.set(x, y, z); e.castShadow = true; return e;
};
const sph = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const e = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), m); e.position.set(x, y, z); e.castShadow = true; return e;
};

type Anim = (t: number) => void;

export class Scene {
  el!: HTMLElement;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  buildLayer = new THREE.Group();
  ghost = new THREE.Group();
  troopLayer = new THREE.Group();
  fxLayer = new THREE.Group();
  ornamentLayer = new THREE.Group();
  workerLayer = new THREE.Group();
  landLayer = new THREE.Group();      // optional 3D land/terrain asset
  groundPlate?: THREE.Mesh;           // refs to toggle when a land GLB is used
  gridHelper?: THREE.GridHelper;
  ornAnims: Anim[] = [];
  workers: any[] = [];
  workerBlockers: any[] = [];   // building footprints workers steer around
  workersIdle = false;          // BOTH storages full → workers nap inside the Worker House
  workerHome: { x: number; z: number } | null = null;   // Worker House world position
  sleepIcon: THREE.Sprite | null = null;                 // Zzz floating over the house when idle
  awakeIdx = 0;                 // the ONE worker kept on duty while the rest nap — rotates so they take turns
  awakeRotTimer = 0;            // seconds until the on-duty worker swaps shift with a sleeper
  pokeTimer = 0;                // >0 after the player taps the house: sleepers shuffle out, then trudge back to bed
  pollTime = 0;                 // server-aligned time of the last setState — producers tick live from here
  lastFrame = 0;
  particles: any[] = [];
  troopLevels: Record<string, number> = {};   // player's researched troop levels (from the Lab)
  beams: any[] = [];          // short-lived combat FX (laser beams, lightning, muzzle flashes)
  _radTex?: THREE.Texture;    // shared radial sprite texture (cached)
  _aimE = new THREE.Euler();  // scratch for turret aiming
  _aimQ = new THREE.Quaternion();
  shake = 0;
  _wasShaking = false;
  autoOrbit = false;                 // 360° mode: slowly spin the camera
  onOrbit?: (on: boolean) => void;   // notify the UI when orbit turns off (e.g. user drags)
  elecWallMats: any[] = [];          // materials of electrified (L4+) walls — flicker each frame
  skyFixed: number | null = null;    // freeze the day/night cycle at a nice time
  resourceNodes: any[] = [];         // border trees/rocks workers walk out to harvest
  _blobTex?: THREE.Texture;          // soft contact-shadow under units
  ro?: ResizeObserver;
  sky: any = { starMats: [], nebMats: [] };   // day/night refs
  labels!: HTMLDivElement;
  hoverTip?: HTMLDivElement;
  npLayer?: HTMLDivElement;

  battle: any = null;
  deployType: string | null = null;
  onBattleUpdate: (s: any) => void = () => {};
  onBattleEnd: (r: any) => void = () => {};

  cam = { target: new THREE.Vector3(0, 0, 0), dist: 47, azim: Math.PI * 0.25, elev: 0.50 };  // angled view shows the galaxy + planets on the horizon
  ptr = new THREE.Vector2();         // last pointer NDC
  hover = { fx: GRID / 2, fy: GRID / 2 };

  state: any = null;
  sig = '';
  timeOffset = 0;
  buildMode: string | null = null;
  items: { b: any; group: THREE.Group; label: HTMLDivElement; anchorY: number }[] = [];

  onPlace: (type: string, x: number, y: number) => void = () => {};
  onSelect: (b: any | null) => void = () => {};
  onMove: (b: any, x: number, y: number) => void = () => {};
  onCollect: (id?: string) => void = () => {};
  dragItem: any = null;

  async init(el: HTMLElement, opts: { interactive?: boolean } = {}) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    el.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(C.space);
    this.scene.fog = new THREE.FogExp2(C.space, 0.004);
    // image-based lighting so no surface ever renders pitch black
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(46, el.clientWidth / el.clientHeight, 0.1, 600);

    this.addSky();
    this.addStars();
    this.addNebula();
    this.addPlanets();
    this.addGround();
    this.addLand();
    this.addOrnaments();
    this.addLights();
    this.scene.add(this.buildLayer, this.ghost, this.troopLayer, this.fxLayer, this.ornamentLayer, this.workerLayer, this.landLayer);

    // label overlay (crisp HTML, projected each frame)
    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;';
    el.style.position = 'relative';
    el.appendChild(this.labels);
    this.labels.addEventListener('click', (e) => {   // tap a floating producer amount to collect
      const t = (e.target as HTMLElement).closest('.collect-lbl') as HTMLElement | null;
      if (t) this.onCollect(t.dataset.id);
    });
    // hover info tooltip (name · level · HP) — shown on pointer-over a building/wall
    this.hoverTip = document.createElement('div');
    this.hoverTip.style.cssText = 'position:absolute;z-index:7;pointer-events:none;display:none;transform:translate(-50%,-130%);background:rgba(8,12,22,.93);border:1px solid rgba(120,180,255,.45);border-radius:10px;padding:6px 11px;font:700 12px "Baloo 2",sans-serif;color:#eaf2ff;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,.55),0 0 16px rgba(24,224,255,.22)';
    el.appendChild(this.hoverTip);
    // battle nameplates + floating damage numbers (HTML overlay, projected each frame)
    this.npLayer = document.createElement('div');
    this.npLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;';
    el.appendChild(this.npLayer);

    if (import.meta.env?.DEV) (window as any).__sc = this;   // dev debug handle
    if (opts.interactive !== false) this.bindInput();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
    this.updateCamera();
    this.renderer.setAnimationLoop((t) => this.frame(t));

    // load any uploaded GLB models, then swap them in (missing files stay procedural)
    preloadModels().then(() => {
      if (!Object.values(MODELS).some(Boolean)) return;   // nothing uploaded — keep procedural
      this.sig = '';
      if (this.state) this.rebuild();
      this.addLand();                                      // swap in 3D land if uploaded
      this.addOrnaments();                                 // swap in GLB trees/rocks border
      this.workerLayer.clear(); this.workers = [];
      if (this.state && !this.battle) this.syncWorkers(this.state.player?.buildersTotal || 0);
    });
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  whenModelsReady(): Promise<void> { return preloadModels(); }   // resolves once GLBs are loaded (or 404'd)

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro?.disconnect();
    try { this.renderer.dispose(); } catch {}
    this.renderer.domElement.remove();
    this.labels?.remove();
  }

  // ---------- world build ----------
  addLights() {
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a4a86, 0.9); this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0x8fa2d8, 0.5); this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(28, 50, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera as THREE.OrthographicCamera;
    s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 160;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5); fill.position.set(-26, 26, -22); this.scene.add(fill);
    const p1 = new THREE.PointLight(C.cyan, 0.7, 100); p1.position.set(-20, 16, -16); this.scene.add(p1);
    const p2 = new THREE.PointLight(C.magenta, 0.6, 100); p2.position.set(22, 14, 22); this.scene.add(p2);

    // the sun (solar-system star) and the moon, far away, moved each frame by the day/night cycle
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 18), new THREE.MeshBasicMaterial({ color: 0xfff1c2, fog: false }));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(), color: 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunGlow.scale.set(160, 160, 1); sunMesh.add(sunGlow); this.scene.add(sunMesh);
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 18), new THREE.MeshStandardMaterial({ color: 0xcdd6ee, emissive: 0x556088, emissiveIntensity: 0.5, fog: false }));
    this.scene.add(moonMesh);
    Object.assign(this.sky, { hemi, amb, sun, sunMesh, sunGlow, moonMesh });
  }

  // smooth day <-> night cycle (one full cycle ~150s); drives sun/moon, sky colour, star & nebula brightness
  updateSky(t: number) {
    const sk = this.sky; if (!sk.sun) return;
    const ang = (t / 150) * Math.PI * 2;                       // sun orbit angle
    const sunY = Math.sin(ang);
    const day = Math.max(0, Math.min(1, (sunY + 0.18) / 0.5));  // 0 night .. 1 day, smooth dawn/dusk
    const sx = Math.cos(ang) * 320, sy = sunY * 300, sz = -120;
    const ly = Math.max(8, sy), llen = Math.hypot(sx, ly, sz) || 1, lk = 95 / llen;   // keep shadow light close
    sk.sun.position.set(sx * lk, ly * lk, sz * lk);                                    // (visual sun stays far below)
    sk.sun.intensity = 0.2 + day * 1.8;
    sk.sun.color.setRGB(0.55 + day * 0.45, 0.6 + day * 0.4, 0.78 + day * 0.22);
    sk.sunMesh.position.set(sx, sy, sz); sk.sunMesh.visible = sunY > -0.15;
    (sk.sunGlow.material as any).opacity = 0.3 + day * 0.6;
    sk.moonMesh.position.set(-sx, -sy, -sz); sk.moonMesh.visible = sunY < 0.15;
    sk.hemi.intensity = 0.45 + day * 0.7;
    sk.amb.intensity = 0.32 + day * 0.5;
    // sky colour: deep galaxy night -> soft blue day
    const r = 0.03 + day * 0.56, g = 0.04 + day * 0.68, b = 0.12 + day * 0.83;
    (this.scene.background as THREE.Color).setRGB(r, g, b);
    (this.scene.fog as THREE.FogExp2).color.setRGB(r, g, b);
    sk.domeMat.opacity = 1 - day * 0.92;                       // galaxy gradient fades out in daytime
    for (const s of sk.starMats) s.m.opacity = s.base * (1 - day * 0.95);   // stars shine at night
    for (const n of sk.nebMats) n.m.opacity = n.base * (1 - day * 0.7);
  }

  addGround() {
    const half = GRID / 2;
    // dark metallic plate
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID, GRID),
      new THREE.MeshStandardMaterial({ color: C.floor, metalness: 0.7, roughness: 0.55 }),
    );
    plate.rotation.x = -Math.PI / 2; plate.position.y = -0.02; plate.receiveShadow = true;
    this.scene.add(plate); this.groundPlate = plate;

    // glowing neon grid
    const grid = new THREE.GridHelper(GRID, GRID, C.grid, C.gridDim);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as any).opacity = 0.8;
    grid.position.y = 0.02;
    this.scene.add(grid); this.gridHelper = grid;

    // bright border ring around the buildable area
    const ringGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(GRID, 0.2, GRID));
    const ring = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: C.cyan }));
    ring.position.y = 0.1; this.scene.add(ring);
  }

  // optional 3D land/terrain GLB — flat buildable top stays at y=0, decorative edges/trees below.
  // building placement uses the math groundPlane (y=0) so it's unaffected by the visual swap.
  // find the flat buildable TOP surface of a land model (largest up-facing horizontal area)
  detectPlatform(obj: THREE.Object3D): { y: number; w: number; cx: number; cz: number } | null {
    obj.updateWorldMatrix(true, true);
    const pts: number[][] = []; let minY = Infinity, maxY = -Infinity;
    obj.traverse((m: any) => {
      const g = m.geometry; if (!g?.attributes?.position || !g.attributes.normal) return;
      const P = g.attributes.position, N = g.attributes.normal, e = m.matrixWorld.elements;
      const sx = Math.hypot(e[1], e[5], e[9]) || 1;
      for (let i = 0; i < P.count; i += 2) {
        const wny = (e[1] * N.getX(i) + e[5] * N.getY(i) + e[9] * N.getZ(i)) / sx;
        if (wny <= 0.7) continue;                                       // only up-facing faces
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        pts.push([e[0] * x + e[4] * y + e[8] * z + e[12], wy, e[2] * x + e[6] * y + e[10] * z + e[14]]);
        if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
      }
    });
    if (pts.length < 30) return null;
    const H = (maxY - minY) || 1, NB = 28;
    const bins = Array.from({ length: NB }, () => ({ c: 0, ysum: 0, xmin: Infinity, xmax: -Infinity, zmin: Infinity, zmax: -Infinity }));
    for (const v of pts) { const b = bins[Math.min(NB - 1, Math.floor((v[1] - minY) / H * NB))]; b.c++; b.ysum += v[1]; if (v[0] < b.xmin) b.xmin = v[0]; if (v[0] > b.xmax) b.xmax = v[0]; if (v[2] < b.zmin) b.zmin = v[2]; if (v[2] > b.zmax) b.zmax = v[2]; }
    let best: any = null;
    // the buildable top = the up-facing band with the most surface (count × area); use its EXACT avg Y
    for (let b = 0; b < NB; b++) { const bn = bins[b]; if (bn.c < 15) continue; const w = bn.xmax - bn.xmin, d = bn.zmax - bn.zmin, score = bn.c * w * d; if (!best || score > best.score) best = { score, y: bn.ysum / bn.c, w: Math.max(w, d), cx: (bn.xmin + bn.xmax) / 2, cz: (bn.zmin + bn.zmax) / 2 }; }
    return best;
  }
  addLand() {
    this.landLayer.clear();
    const land = this.modelFor('land');
    if (!land) { if (this.groundPlate) this.groundPlate.visible = true; if (this.gridHelper) (this.gridHelper.material as any).opacity = 0.8; return; }
    const plat = this.detectPlatform(land);
    let scale: number, cx: number, cz: number, topY: number;
    if (plat) {                                  // flat top a bit BIGGER than the grid so the grid sits INSIDE it, surface at y=0
      scale = GRID / ((plat.w || 1) * 0.8);
      cx = plat.cx; cz = plat.cz; topY = plat.y;
    } else {                                      // fallback: bbox fit
      const b = new THREE.Box3().setFromObject(land); const sz = b.getSize(new THREE.Vector3());
      scale = (GRID + 2) / (Math.max(sz.x, sz.z) || 1); cx = (b.min.x + b.max.x) / 2; cz = (b.min.z + b.max.z) / 2; topY = b.max.y;
    }
    land.scale.setScalar(scale);
    land.position.set(-cx * scale, -topY * scale, -cz * scale);    // platform centered + surface at y=0
    land.traverse((o: any) => { if (o.isMesh) o.receiveShadow = true; });
    this.landLayer.add(land);
    this.landLayer.rotation.y = (window as any).__landrot ?? Math.PI;   // turn the tall crystals away from the default camera
    if (this.groundPlate) this.groundPlate.visible = false;        // land replaces the flat plate
    if (this.gridHelper) (this.gridHelper.material as any).opacity = 0.32;   // keep a faint build grid on top
  }

  // gradient skydome so the whole view reads as deep galaxy (purple->blue->black)
  addSky() {
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#2c1158'); g.addColorStop(0.32, '#1a1c54'); g.addColorStop(0.62, '#0b1136'); g.addColorStop(1.0, '#05060f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    const domeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 1 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), domeMat);
    this.scene.add(dome);
    this.sky.domeMat = domeMat;
  }

  addStars() {
    const cloud = (n: number, color: number, size: number, op: number) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 140 + Math.random() * 260;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.75 + 6;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: op, depthWrite: false });
      this.sky.starMats.push({ m, base: op });
      this.scene.add(new THREE.Points(g, m));
    };
    cloud(5000, 0xeaf2ff, 1.0, 0.95);  // many white stars
    cloud(1400, 0x8fbcff, 1.7, 0.85);  // blue giants
    cloud(900, 0xff9bd4, 1.6, 0.8);    // pink stars
    cloud(600, 0xfff0b0, 1.5, 0.8);    // warm stars
  }

  addNebula() {
    const tex = this.radialTexture();
    const make = (color: number, x: number, y: number, z: number, s: number, op = 0.45) => {
      const sm = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Sprite(sm);
      m.position.set(x, y, z); m.scale.set(s, s, 1); this.scene.add(m);
      this.sky.nebMats.push({ m: sm, base: op });
    };
    make(C.purple, -120, 60, -150, 240);
    make(C.cyan, 150, 50, -160, 200);
    make(C.magenta, -60, 40, 180, 180);
    make(0x5a6bff, 120, 80, 150, 200, 0.4);
    make(0xff5cb0, -180, 90, 40, 160, 0.35);
    // a big tilted galaxy disc low on the horizon
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9a7bff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.position.set(60, 18, -220); disc.scale.set(420, 150, 1); this.scene.add(disc);
  }

  // real planets ringing the deep-space sky (visible from any camera angle)
  addPlanets() {
    const glowTex = this.radialTexture();
    const make = (color: number, x: number, y: number, z: number, r: number, ring?: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24),
        new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.8, emissive: new THREE.Color(color), emissiveIntensity: 0.35, fog: false }));
      m.position.set(x, y, z); this.scene.add(m);
      // soft atmosphere halo so the planet reads against the stars
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      halo.position.set(x, y, z); halo.scale.set(r * 5, r * 5, 1); this.scene.add(halo);
      if (ring) {
        const rg = new THREE.Mesh(new THREE.RingGeometry(r * 1.4, r * 2.3, 64),
          new THREE.MeshBasicMaterial({ color: ring, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
        rg.rotation.x = Math.PI * 0.46; rg.rotation.z = 0.35; rg.position.set(x, y, z); this.scene.add(rg);
      }
      return m;
    };
    const cols = [0xe0913a, 0x5a8bff, 0xc05ed8, 0xff6b5c, 0x6effc0, 0xffd25e];
    const planets: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const dist = 210 + (i % 2) * 50;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist, y = 14 + (i % 3) * 16;   // low, loom on the horizon
      planets.push(make(cols[i], x, y, z, 42 + (i % 3) * 16, i === 0 ? 0xffd28a : (i === 3 ? 0xc9b6ff : undefined)));
    }
    this.ornAnims.push((t) => planets.forEach((p, i) => { p.rotation.y = t * (0.05 + i * 0.01); }));
  }
  radialTexture() {
    if (this._radTex) return this._radTex;   // cache once — was leaking a CanvasTexture per flash/shot
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!; const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return (this._radTex = new THREE.CanvasTexture(c));
  }

  // ---------- decorative ornaments — a FEW, only around the edges ----------
  addOrnaments() {
    this.ornamentLayer.clear();
    this.ornAnims = [];
    this.resourceNodes = [];
    if (!MODELS_READY) return;     // wait for the GLB trees/rocks — no procedural ones during load
    // a tidy BORDER of trees + rocks fencing all 4 sides of the play area
    const hasLand = !!MODELS['land'];
    const B = hasLand ? GRID / 2 - 3.5 : GRID / 2 - 1.6;   // pull in a bit when the land has its own rim trees
    const per = hasLand ? 2 : 20;          // just a few harvestable props if the land already has edge trees
    const jit = () => (Math.random() - 0.5) * 0.5;
    const drop = (x: number, z: number, i: number) => {
      const kind = i % 3;            // repeating pattern: tree, tree_b, rock
      const o = kind === 0 ? this.ornTree(x, z, 'tree')
        : kind === 1 ? this.ornTree(x, z, 'tree_b')
          : this.ornRock(x, z);
      this.ornamentLayer.add(o.mesh); if (o.anim) this.ornAnims.push(o.anim);
      this.resourceNodes.push({ x, z, mesh: o.mesh, kind: kind === 2 ? 'rock' : 'tree' });
    };
    let idx = 0;
    for (let i = 0; i < per; i++) {
      const f = (i + 0.5) / per;      // 0..1 along the edge (skip exact corners)
      const p = -B + f * 2 * B;
      drop(p + jit(), B + jit(), idx++);    // top edge
      drop(p + jit(), -B + jit(), idx++);   // bottom edge
      drop(-B + jit(), p + jit(), idx++);   // left edge
      drop(B + jit(), p + jit(), idx++);    // right edge
    }
  }
  ornTree(x: number, z: number, model?: string) {
    const gm = model ? this.modelFor(model) : null;
    if (gm) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      this.fitHeight(gm, 2.3 + Math.random() * 0.9);     // tall border trees
      g.add(gm); g.rotation.y = Math.random() * 6;
      return { mesh: g };
    }
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const th = 1.1 + Math.random() * 0.9;                                  // tall trunk
    g.add(cyl(0.11, 0.17, th, mat(0x6b7793, { metal: 0.8 }), 6, 0, th / 2, 0));
    const col = [0x9bff3b, 0x46e6ff, 0xc98bff, 0xffd25e][Math.floor(Math.random() * 4)];
    const r1 = 0.75 + Math.random() * 0.45;
    const leaf = (r: number, y: number, ei: number) => { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(0x2a3a4a, { emissive: col, emI: ei, metal: 0.3, rough: 0.45 })); c.position.y = y; c.castShadow = true; g.add(c); };
    leaf(r1, th + r1 * 0.55, 0.5);
    leaf(r1 * 0.62, th + r1 * 1.25, 0.65);                                 // a second crown layer
    g.scale.setScalar(1.25 + Math.random() * 0.85);                        // BIG trees
    g.rotation.y = Math.random() * 6;
    return { mesh: g };
  }
  ornRock(x: number, z: number) {
    const gm = this.modelFor('rock');
    if (gm) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      this.fitHeight(gm, 0.7 + Math.random() * 0.6); g.add(gm); g.rotation.y = Math.random() * 6;
      return { mesh: g };
    }
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), mat(0x49506e, { metal: 0.5, rough: 0.9 }));
    m.position.set(x, 0.1, z); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.scale.set(0.8 + Math.random(), 0.5 + Math.random() * 0.5, 0.8 + Math.random()); m.castShadow = true;
    return { mesh: m };
  }
  ornCrystal(x: number, z: number) {
    const col = [0x46e6ff, 0xc98bff, 0xff5cb0, 0xbcff5e][Math.floor(Math.random() * 4)];
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6 + Math.random() * 0.4, 5),
      mat(col, { emissive: col, emI: 0.7, metal: 0.2, rough: 0.2, transparent: true, opacity: 0.85 }));
    m.position.set(x, 0.32, z); m.rotation.y = Math.random() * 6;
    return { mesh: m, anim: (t: number) => { (m.material as any).emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2 + x)) * 0.5; } };
  }
  ornAsteroid(x: number, z: number) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + Math.random() * 0.1, 0), mat(0x6b6f80, { metal: 0.7, rough: 0.7 }));
    const y = 1.0 + Math.random() * 1.8; m.position.set(x, y, z);
    return { mesh: m, anim: (t: number) => { m.rotation.x = t * 0.6 + x; m.rotation.y = t * 0.8; m.position.y = y + Math.sin(t * 1.2 + z) * 0.28; } };
  }

  // ---------- worker robots (one per builder, wander + sleep when tired) ----------
  workerMesh() {
    const gm = this.modelFor('worker');
    if (gm) {
      const g = new THREE.Group();
      this.fitHeight(gm, 0.9); g.add(gm);
      g.add(this.groundBlob(0.34));                                       // contact shadow
      g.userData.legRig = gm.userData.mixer ? null : this.findLegs(gm);   // procedural legs unless baked clip
      const zzz = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xffffff, 1.1));
      zzz.position.set(0.18, 0.95, 0); zzz.visible = false; g.add(zzz);
      g.userData.zzz = zzz;
      return g;
    }
    const g = new THREE.Group();
    g.add(box(0.34, 0.38, 0.28, mat(0xffc24a, { metal: 0.5, rough: 0.5 }), 0, 0.32, 0));   // hi-vis body
    g.add(box(0.26, 0.24, 0.24, mat(0xe0a93a, { metal: 0.6 }), 0, 0.62, 0));                // head
    g.add(sph(0.05, glow(0x18e0ff, 1.7), 0, 0.64, 0.12));                                   // eye
    g.add(box(0.035, 0.16, 0.035, mat(0x2a2f3c), 0, 0.82, 0));                              // antenna
    g.add(sph(0.05, glow(0xff5cb0, 1.5), 0, 0.92, 0));
    g.add(box(0.1, 0.18, 0.1, mat(0x5d6cab), -0.09, 0.1, 0));                               // legs
    g.add(box(0.1, 0.18, 0.1, mat(0x5d6cab), 0.09, 0.1, 0));
    const zzz = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xffffff, 1.1));
    zzz.position.set(0.18, 1.05, 0); zzz.visible = false; g.add(zzz);
    g.userData.zzz = zzz; g.scale.setScalar(0.95);
    return g;
  }
  syncWorkers(n: number) {
    while (this.workers.length < n) {
      const m = this.workerMesh();
      const x = (Math.random() * 2 - 1) * 8, z = (Math.random() * 2 - 1) * 8;
      m.position.set(x, 0, z); this.workerLayer.add(m);
      const animated = !!(m.children[0] as any)?.userData?.mixer;   // GLB has its own baked clip
      const legRig = (m as any).userData?.legRig;                    // procedural leg bones
      this.workers.push({ mesh: m, zzz: m.userData.zzz, x, z, tx: x, tz: z, state: 'walk', timer: 0, hop: Math.random() * 6, phase: Math.random() * 6, animated, legRig, targetNode: null, hoX: (Math.random() * 2 - 1) * 0.85, hoZ: (Math.random() * 2 - 1) * 0.85 });
    }
    while (this.workers.length > n) { const w = this.workers.pop(); if (w) this.workerLayer.remove(w.mesh); }
  }
  pickWorkerTarget(w: any) {
    if (this.resourceNodes.length && Math.random() < 0.65) {            // go harvest a border tree/rock
      const n = this.resourceNodes[Math.floor(Math.random() * this.resourceNodes.length)];
      w.targetNode = n;
      const dd = Math.hypot(n.x, n.z) || 1;                            // stand ~1.5u in front of it (toward centre)
      w.tx = n.x - (n.x / dd) * 1.5; w.tz = n.z - (n.z / dd) * 1.5;
    } else {
      w.targetNode = null;
      const R = 13;
      for (let i = 0; i < 8; i++) { w.tx = (Math.random() * 2 - 1) * R; w.tz = (Math.random() * 2 - 1) * R; if (!this.blockerAt(w.tx, w.tz)) break; }   // don't wander INTO a building
    }
  }
  makeSleepIcon(): THREE.Sprite {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d')!;
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    // bright gold "Zzz" with a thick dark outline → pops on the dark ground AND the yellow house (no more washed-out blue)
    cx.font = 'bold 70px Arial'; cx.lineJoin = 'round';
    cx.lineWidth = 12; cx.strokeStyle = '#241636'; cx.strokeText('Zzz', 64, 70);
    cx.fillStyle = '#ffd83a'; cx.fillText('Zzz', 64, 70);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.setScalar(1.7); return sp;
  }
  // show a 💤 over the Worker House while the workers are napping (storages full)
  updateSleepIcon() {
    if (!this.sleepIcon) this.sleepIcon = this.makeSleepIcon();
    if (this.sleepIcon.parent !== this.workerLayer) this.workerLayer.add(this.sleepIcon);   // re-attach after a rebuild clear
    const show = this.workersIdle && !!this.workerHome;
    this.sleepIcon.visible = show;
    if (show && this.workerHome) this.sleepIcon.position.set(this.workerHome.x, 2.3, this.workerHome.z);
  }
  // tap the Worker House while they're napping → the sleepers shuffle out, glance around, then trudge back to bed
  pokeWorkers(b: any) {
    if (b?.type !== 'builders_hut' || !this.workersIdle || !this.workerHome) return;
    this.pokeTimer = 4.5;          // awake for ~4.5s, then back to sleep (they realise it's still full)
    for (const w of this.workers) w.outX = undefined;   // pick fresh spots to spill out to
    sfx.wake();
  }
  updateWorkers(t: number, dt: number) {
    // off-duty shift bookkeeping (only matters while the storages are full)
    if (this.pokeTimer > 0) this.pokeTimer = Math.max(0, this.pokeTimer - dt);
    if (this.workersIdle && this.workers.length > 1 && this.pokeTimer <= 0) {
      this.awakeRotTimer -= dt;
      if (this.awakeRotTimer <= 0) { this.awakeRotTimer = 8 + Math.random() * 5; this.awakeIdx = (this.awakeIdx + 1) % this.workers.length; }   // swap who's on duty → they take turns
    }
    // house "Zzz": only while someone's actually asleep (hidden while the player has poked them awake)
    if (this.sleepIcon) {
      const napping = this.workersIdle && !!this.workerHome && this.pokeTimer <= 0;
      this.sleepIcon.visible = napping;
      if (napping && this.workerHome) this.sleepIcon.position.set(this.workerHome.x, 2.4 + Math.sin(t * 2) * 0.12, this.workerHome.z);
    }
    for (let wi = 0; wi < this.workers.length; wi++) {
      const w = this.workers[wi];
      const rig = w.legRig;
      const onDuty = this.workers.length <= 1 || wi === this.awakeIdx;    // ALWAYS keep ≥1 robot working — never a full shutdown
      // storages FULL and this one's OFF duty → nap in the house (or shuffle OUT for a few secs when the player taps the house, then back to bed)
      if (this.workersIdle && this.workerHome && !onDuty) {
        const poked = this.pokeTimer > 0;
        let hx: number, hz: number;
        if (poked) {
          if (w.outX === undefined) { const a = Math.random() * Math.PI * 2, r = 2.4 + Math.random() * 1.8; w.outX = this.workerHome.x + Math.cos(a) * r; w.outZ = this.workerHome.z + Math.sin(a) * r; }
          hx = w.outX; hz = w.outZ;                                        // a spot just outside the house
        } else { w.outX = undefined; hx = this.workerHome.x + (w.hoX || 0); hz = this.workerHome.z + (w.hoZ || 0); }
        const dx = hx - w.x, dz = hz - w.z, d = Math.hypot(dx, dz);
        w.zzz.visible = false;
        if (!poked && d < 0.7) { w.mesh.visible = false; continue; }       // tucked inside, asleep
        w.mesh.visible = true;
        if (poked && d < 0.5) { w.mesh.rotation.y += dt * 1.6; if (rig) this.stepLegs(rig, 0, 0); continue; }   // milling about outside, glancing around
        const v = (poked ? 2.0 : 1.6) * dt, mvx = (dx / d) * v, mvz = (dz / d) * v;
        w.x += mvx; w.z += mvz; w.mesh.position.x = w.x; w.mesh.position.z = w.z;
        w.mesh.rotation.y = Math.atan2(mvx, mvz);
        if (rig) { w.phase += dt * 9; this.stepLegs(rig, w.phase, 0.55); }
        continue;
      }
      if (!w.mesh.visible) { w.mesh.visible = true; w.state = 'walk'; w.zzz.visible = false; }   // woke up → back to work
      if (w.state === 'sleep') {
        w.timer -= dt; w.mesh.position.y = 0; w.mesh.rotation.z = 0; w.zzz.visible = true;
        if (rig) this.stepLegs(rig, 0, 0);
        w.zzz.position.y = 0.95 + Math.sin(t * 3) * 0.06;
        if (w.timer <= 0) { w.state = 'walk'; w.zzz.visible = false; this.pickWorkerTarget(w); }
        continue;
      }
      if (w.state === 'work') {                                         // chopping a tree / mining a rock
        w.timer -= dt;
        const n = w.targetNode;
        if (n) { w.mesh.rotation.y = Math.atan2(n.x - w.x, n.z - w.z); n.mesh.rotation.z = Math.sin(t * 12) * 0.07; }   // node shakes
        if (rig) { this.stepLegs(rig, 0, 0); this.chopArm(rig, Math.sin(t * 12) * 0.5); }                              // swing the tool arm
        else w.mesh.position.y = Math.abs(Math.sin(t * 12)) * 0.05;
        if (w.timer <= 0) { if (n) n.mesh.rotation.z = 0; if (rig) this.chopArm(rig, 0); w.targetNode = null; w.state = 'walk'; this.pickWorkerTarget(w); }
        continue;
      }
      // walking toward the target
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      if (d < 0.5) {
        if (w.targetNode) { w.state = 'work'; w.timer = 2.2 + Math.random() * 2.4; }       // arrived → harvest
        else if (!this.workersIdle && Math.random() < 0.15) { w.state = 'sleep'; w.timer = 2 + Math.random() * 3; }   // the on-duty robot keeps working — no catnaps while the rest are off
        else this.pickWorkerTarget(w);
      } else {
        const v = 1.4 * dt;
        let mvx = (dx / d) * v, mvz = (dz / d) * v;
        const blk = this.blockerAt(w.x + mvx, w.z + mvz);               // would this step walk into a building?
        if (blk) {                                                      // slide AROUND it instead of through it
          let ox = w.x - blk.x, oz = w.z - blk.z, od = Math.hypot(ox, oz);
          if (od < 0.05) { ox = -dx; oz = -dz; od = d || 1; }          // dead-centre → back out the way we came
          const nx = ox / od, nz = oz / od;                            // outward normal
          let tx = -nz, tz = nx;                                       // tangent around the building…
          if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }           // …on the side toward the goal
          mvx = tx * v + nx * v * 0.45;                                // glide along + push outward (no penetration)
          mvz = tz * v + nz * v * 0.45;
        }
        w.x += mvx; w.z += mvz;                                         // glide along the ground
        w.mesh.position.x = w.x; w.mesh.position.z = w.z;
        w.mesh.rotation.y = Math.atan2(mvx, mvz);                       // face actual travel direction
        if (rig) {                                                       // SWING THE ACTUAL LEG BONES
          w.phase += dt * 9;
          this.stepLegs(rig, w.phase, 0.55);
          w.mesh.position.y = Math.abs(Math.sin(w.phase)) * 0.02;
        } else if (!w.animated) {
          const step = (t + w.hop) * 6;
          w.mesh.position.y = Math.abs(Math.sin(step)) * 0.045;
          w.mesh.rotation.z = Math.sin(step) * 0.05;
        }
      }
    }
  }

  // ---------- coordinate helpers ----------
  worldCenter(gx: number, gy: number, size: number) {
    return new THREE.Vector3(gx + size / 2 - GRID / 2, 0, gy + size / 2 - GRID / 2);
  }
  pointerToGround(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ptr, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }
  updateHoverFromPointer() {
    const p = this.pointerToGround(); if (!p) return;
    this.hover.fx = p.x + GRID / 2; this.hover.fy = p.z + GRID / 2;
  }

  // ---------- camera ----------
  camPos() {
    const { target, dist, azim, elev } = this.cam;
    return new THREE.Vector3(
      target.x + dist * Math.cos(elev) * Math.sin(azim),
      target.y + dist * Math.sin(elev),
      target.z + dist * Math.cos(elev) * Math.cos(azim),
    );
  }
  updateCamera() { this.camera.position.copy(this.camPos()); this.camera.lookAt(this.cam.target); }
  resetCamera() { this.autoOrbit = false; this.cam.target.set(0, 0, 0); this.cam.dist = 47; this.cam.azim = Math.PI * 0.25; this.cam.elev = 0.50; this.updateCamera(); }   // back to the default view

  // explosion debris + screen shake (battle juice)
  spawnExplosion(x: number, z: number, color: number) {
    for (let i = 0; i < 14; i++) {
      const m = box(0.2, 0.2, 0.2, glow(i % 2 ? color : 0xffd25e, 1.3), x, 0.5, z);
      this.fxLayer.add(m);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      this.particles.push({ mesh: m, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 4.5, vz: Math.sin(a) * sp, life: 1 });
    }
    this.shake = Math.min(1.2, this.shake + 0.5);
  }
  updateParticles(dt: number) {
    for (const p of this.particles) {
      if (p.debris) {   // chunky wreckage that flies out and SETTLES as rubble on the ground
        if (p.settled) continue;
        p.vy -= 13 * dt;
        p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt; p.mesh.rotation.z += p.ry * dt;
        if (p.mesh.position.y < 0.12) { p.mesh.position.y = 0.12; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; if (Math.abs(p.vy) < 0.5) p.settled = true; }
        continue;
      }
      p.life -= dt * 1.5;
      if (p.life <= 0) { if (p.mesh.parent) this.fxLayer.remove(p.mesh); continue; }
      p.vy -= 13 * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.1) { p.mesh.position.y = 0.1; p.vy *= -0.4; p.vx *= 0.6; p.vz *= 0.6; }
      p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 5;
      p.mesh.scale.setScalar(Math.max(0.02, p.life));
    }
    this.particles = this.particles.filter((p) => p.debris || p.life > 0);
  }
  // leftover wreckage fragments when a building/wall is destroyed
  spawnDebris(x: number, z: number, color: number, size = 1) {
    const n = 4 + Math.floor(size * 2);
    for (let i = 0; i < n; i++) {
      const s = 0.16 + Math.random() * 0.22 * size;
      const m = box(s, s * 0.7, s, mat(0x3a4055, { metal: 0.6, rough: 0.85, emissive: color, emI: 0.12 }), x + (Math.random() - 0.5) * size, 0.5, z + (Math.random() - 0.5) * size);
      m.castShadow = true; this.fxLayer.add(m);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3 * size;
      this.particles.push({ mesh: m, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, life: 99, debris: true, rx: Math.random() * 7 - 3.5, ry: Math.random() * 7 - 3.5 });
    }
  }
  // a small billboarded HP bar (background + colored fill)
  makeHpBar(w = 1.4): THREE.Group {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), new THREE.MeshBasicMaterial({ color: 0x0a0e16, transparent: true, opacity: 0.85, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), new THREE.MeshBasicMaterial({ color: 0x3bff6a, depthTest: false }));
    fill.position.z = 0.003; bg.renderOrder = 30; fill.renderOrder = 31;
    g.add(bg, fill); g.userData = { fill, w };
    return g;
  }
  updateHpBar(g: THREE.Group, pct: number) {
    pct = Math.max(0, Math.min(1, pct));
    const fill = g.userData.fill as THREE.Mesh, w = g.userData.w as number;
    fill.scale.x = Math.max(0.001, pct);
    fill.position.x = -(1 - pct) * w * 0.5;
    (fill.material as any).color.setHex(pct > 0.5 ? 0x3bff6a : pct > 0.25 ? 0xffd25e : 0xff4d4d);
    g.quaternion.copy(this.camera.quaternion);   // billboard to camera
  }
  // ---- battle nameplates (name + HP bar + numbers) + floating damage popups ----
  makeNameplate(name: string, showName = true): any {
    const el = document.createElement('div'); el.className = 'np';
    el.innerHTML = (showName ? `<div class="np-name">${name}</div>` : '') + `<div class="np-bar"><div class="np-fill"></div></div><div class="np-hp"></div>`;
    this.npLayer!.appendChild(el);
    return { el, fill: el.querySelector('.np-fill') as HTMLElement, hp: el.querySelector('.np-hp') as HTMLElement };
  }
  placeNameplate(np: any, group: THREE.Object3D, yOff: number, cur: number, max: number, mine = false) {
    if (!np) return;
    const v = new THREE.Vector3(); group.getWorldPosition(v); v.y += yOff; v.project(this.camera);
    if (v.z > 1) { np.el.style.display = 'none'; return; }
    np.el.style.display = '';
    np.el.style.left = ((v.x * 0.5 + 0.5) * this.el.clientWidth) + 'px';
    np.el.style.top = ((-v.y * 0.5 + 0.5) * this.el.clientHeight) + 'px';
    const p = Math.max(0, Math.min(1, cur / max));
    np.fill.style.width = (p * 100) + '%';
    np.fill.style.background = mine ? '#3bff6a' : '#ffd23f';   // GREEN = your units · YELLOW = enemy units
    np.hp.textContent = `${Math.max(0, Math.ceil(cur))}/${Math.ceil(max)}`;
  }
  spawnDamage(x: number, y: number, z: number, amt: number) {
    if (!this.npLayer || amt <= 0) return;
    const v = new THREE.Vector3(x, y, z).project(this.camera); if (v.z > 1) return;
    const el = document.createElement('div'); el.className = 'dmgnum'; el.textContent = '-' + Math.round(amt);
    el.style.left = ((v.x * 0.5 + 0.5) * this.el.clientWidth) + 'px';
    el.style.top = ((-v.y * 0.5 + 0.5) * this.el.clientHeight) + 'px';
    this.npLayer.appendChild(el);
    setTimeout(() => el.remove(), 820);
  }
  updateNameplates() {
    const b = this.battle; if (!b || !this.npLayer) return;
    const myTroops = (b.troopsTeam || 'mine') === 'mine';   // raid: deployed troops are yours; replay: they're the attacker's
    for (const o of b.buildings) {
      if (!o.np) continue;
      if (o.destroyed) { o.np.el.style.display = 'none'; continue; }
      this.placeNameplate(o.np, o.group, (o.anchorY || 2) + 0.3, o.hp, o.maxHp, !myTroops);   // base belongs to the other side
    }
    for (const tr of b.troops) if (tr.np) this.placeNameplate(tr.np, tr.mesh, tr.npY || 1.7, tr.hp, tr.maxHp, myTroops);
    for (const en of b.enemies || []) if (en.np && en.hp > 0) this.placeNameplate(en.np, en.mesh, en.npY || 1.7, en.hp, en.maxHp, !myTroops);
  }
  // who can a troop hit: AIR targets need an air unit (War Jet) or a ranged unit (Archer/Mage); GROUND targets need a ground unit (air flies over)
  canHitTarget(atkType: string, atkIsAir: boolean, target: any) {
    return target.isAir ? (atkIsAir || !!TROOP_HITS_AIR[atkType]) : !atkIsAir;
  }
  nearestEnemyTarget(pool: any[], x: number, z: number, atkType: string, atkIsAir: boolean) {
    let best = null, bd = Infinity;
    for (const t of pool) { if (t.hp <= 0) continue; if (!this.canHitTarget(atkType, atkIsAir, t)) continue; const d = (t.x - x) ** 2 + (t.z - z) ** 2; if (d < bd) { bd = d; best = t; } }
    return best;
  }

  // ---------- state -> meshes ----------
  setState(s: any) {
    this.state = s;
    this.timeOffset = (s.player?.serverTime || Date.now()) - Date.now();
    this.pollTime = Date.now() + this.timeOffset;   // anchor for live producer ticking
    const sig = s.buildings.map((b: any) => `${b.id}:${b.level}`).sort().join('|');
    if (sig !== this.sig) { this.sig = sig; this.rebuild(); }
    if (!this.battle) this.syncWorkers(s.player?.buildersTotal || 0);   // worker robots = builders
    // workers nap inside the Worker House when BOTH storages are full (nothing to carry); collect → they work again.
    // (the demo's wallet is permanently "full", so keep its workers lively instead of always asleep.)
    const p = s.player || {};
    this.workersIdle = !this.battle && !p.demoExpiresAt && p.maxGold > 0 && p.gold >= p.maxGold && p.elixir >= p.maxElixir;
    const house: any = this.items.find((it: any) => it.b.type === 'builders_hut' && it.b.level >= 1);
    this.workerHome = house ? { x: house.group.position.x, z: house.group.position.z } : null;
    this.updateSleepIcon();
  }

  rebuild() {
    for (const it of this.items) it.label.remove();
    this.buildLayer.clear();
    this.items = [];
    this.elecWallMats = [];   // re-collected as walls are tinted
    if (!this.state) return;
    for (const b of this.state.buildings) {
      const def = DEF[b.type]; if (!def) continue;
      const size = def.size;
      const group = new THREE.Group();
      group.position.copy(this.worldCenter(b.gridX, b.gridY, size));
      let anchorY = 4;
      if (b.level < 1) { this.scaffold(group, size); anchorY = 3; }
      else if (!MODELS_READY) { this.loadingPad(group, size); anchorY = 1.4; }   // clean loading slot until GLBs are ready
      else if (b.type === 'wall') { anchorY = 0.6; group.add(this.groundBlob(0.5)); }   // wall pieces added per neighbour-axis in the post-pass
      else { anchorY = this.buildMesh(group, b.type, size, b.level); group.add(this.groundBlob(Math.max(0.55, size * 0.6))); }   // contact shadow
      this.buildLayer.add(group);
      const label = document.createElement('div');
      label.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:800 12px "Baloo 2",sans-serif;color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000;white-space:nowrap;text-align:center;';
      this.labels.appendChild(label);
      this.items.push({ b, group, label, anchorY });
    }
    // walls: add a GLB piece for EACH neighbour axis → straight runs overlap solid, AND a corner gets
    // both an X-piece and a Z-piece (an L) so north×west walls join at the corner.
    const wallAt = new Set<string>();
    for (const b of this.state.buildings) if (b.type === 'wall' && b.level >= 1) wallAt.add(b.gridX + ',' + b.gridY);
    for (const it of this.items) {
      if (it.b.type !== 'wall' || it.b.level < 1) continue;
      const gx = it.b.gridX, gy = it.b.gridY;
      const hasX = wallAt.has((gx + 1) + ',' + gy) || wallAt.has((gx - 1) + ',' + gy);
      const hasZ = wallAt.has(gx + ',' + (gy + 1)) || wallAt.has(gx + ',' + (gy - 1));
      const axes: boolean[] = [];
      if (hasX) axes.push(false);        // span X
      if (hasZ) axes.push(true);         // span Z
      if (!axes.length) axes.push(false);   // isolated wall → one default piece
      for (const spanZ of axes) { const piece = this.wallPiece(spanZ, it.b.level); if (piece) it.group.add(piece); }
    }
    // building footprints workers must walk AROUND (circle = world centre + radius from grid size)
    this.workerBlockers = this.items.filter((it) => it.b.level >= 1).map((it) => ({ x: it.group.position.x, z: it.group.position.z, r: (DEF[it.b.type]?.size || 1) * 0.5 + 0.5 }));
  }
  blockerAt(x: number, z: number) {   // the building whose footprint contains (x,z), or null
    for (const b of this.workerBlockers) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return b;
    return null;
  }
  // one wall GLB scaled to overlap neighbours, spanning X (spanZ=false) or Z (spanZ=true); colour/thickness by level
  wallPiece(spanZ: boolean, level = 1): THREE.Object3D | null {
    const gm = this.modelFor('wall'); if (!gm) return null;
    const bb = new THREE.Box3().setFromObject(gm);
    const longNative = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1;
    const nativeX = (bb.max.x - bb.min.x) >= (bb.max.z - bb.min.z);
    const SP = (window as any).__ws || 1.7;
    gm.scale.setScalar((0.92 * SP) / longNative);            // post-to-post ≈ 1.56 tile (overlaps neighbours)
    gm.scale.multiplyScalar(1 + (level - 1) * 0.09);         // thicker & chunkier as the wall levels up
    const bb2 = new THREE.Box3().setFromObject(gm); gm.position.y -= bb2.min.y;
    gm.rotation.y = ((!spanZ) === nativeX) ? 0 : Math.PI / 2;
    this.tintWall(gm, level);
    return gm;
  }
  // colour-code walls by level: L1 blue → L2 black → L3 red → L4/L5 electrified (cyan flicker, added to elecWallMats)
  tintWall(gm: THREE.Object3D, level: number) {
    const i = Math.min(4, Math.max(0, level - 1));
    const col = [0x2f7bff, 0x15181f, 0xc8202c, 0xff3322, 0xff2a55][i];
    const emi = [0.3, 0.12, 0.45, 0.8, 1.0][i];
    const elec = level >= 4;
    gm.traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      o.material.color = new THREE.Color(col).multiplyScalar(elec ? 0.9 : 0.7);
      if (o.material.emissive) { o.material.emissive = new THREE.Color(elec ? 0x55ddff : col); o.material.emissiveIntensity = emi; }
      if (elec) this.elecWallMats.push(o.material);
    });
  }

  // a clean glowing slot shown while the GLB models are still loading (instead of procedural meshes)
  loadingPad(group: THREE.Group, size: number) {
    const fw = size * 0.92;
    group.add(cyl(fw * 0.5, fw * 0.56, 0.32, mat(C.bodyDark, { metal: 0.8, emissive: C.cyan, emI: 0.22 }), 8, 0, 0.16, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(fw * 0.5, 0.045, 8, 20), glow(C.cyan, 1.2));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.34; group.add(ring);
  }
  scaffold(group: THREE.Group, size: number) {
    const w = size * 0.8;
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, size * 0.6, w)),
      new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.8 }),
    );
    frame.position.y = size * 0.3; group.add(frame);
    group.add(box(w, 0.18, w, mat(C.bodyDark, { emissive: C.cyan, emI: 0.2 }), 0, 0.09, 0));
    const beacon = sph(0.22, glow(C.lime, 1.4), 0, size * 0.65, 0);
    group.add(beacon);
    group.userData.anim = [(t: number) => { beacon.scale.setScalar(0.7 + Math.sin(t * 4) * 0.3); frame.rotation.y = t * 0.5; }];
  }

  // returns label anchor height
  // clone a preloaded GLB (SkeletonUtils for rigged characters), or null if not uploaded
  modelFor(name: string): THREE.Object3D | null {
    const m = MODELS[name];
    if (!m) return null;
    let skinned = false;
    m.traverse((o: any) => { if (o.isSkinnedMesh) skinned = true; });
    const clone = skinned ? SkeletonUtils.clone(m) : m.clone(true);
    const clips = MODEL_ANIMS[name];
    if (clips && clips.length) {                                  // GLB has baked animation → play it
      const mixer = new THREE.AnimationMixer(clone);
      const clip = clips.find((c) => /walk|run|move|idle/i.test(c.name)) || clips[0];
      mixer.clipAction(clip).play();
      clone.userData.mixer = mixer;
    }
    return clone;
  }
  updateMixers(dt: number) {
    const upd = (o: any) => { if (o.userData?.mixer) o.userData.mixer.update(dt); };
    for (const L of [this.workerLayer, this.troopLayer, this.buildLayer, this.ornamentLayer]) {
      for (const c of L.children) { upd(c); for (const cc of (c as any).children) upd(cc); }
    }
  }

  // ---- procedural walk + attack rig for an auto-rigged GLB (no baked animation needed) ----
  // Structure-based: feet = 2 lowest separated leaf bones → their common ancestor is the pelvis →
  // thighs are its children; same logic upward for hands → chest → shoulders. Robust to off-centre / robed models.
  findLegs(root: THREE.Object3D): any {
    let skel: any = null;
    root.traverse((o: any) => { if (o.isSkinnedMesh && !skel) skel = o.skeleton; });
    if (!skel || !skel.bones?.length) return null;
    root.updateWorldMatrix(true, true);
    const wp = new Map<any, THREE.Vector3>();
    skel.bones.forEach((b: any) => { const p = new THREE.Vector3(); b.getWorldPosition(p); wp.set(b, p); });
    const xs = [...wp.values()].map((p) => p.x), ys = [...wp.values()].map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const yMin = Math.min(...ys), yMax = Math.max(...ys), H = (yMax - yMin) || 1;
    const kids = (b: any) => b.children.filter((c: any) => c.isBone);
    const chainUp = (b: any) => { const c: any[] = []; let x = b; while (x?.isBone) { c.push(x); x = x.parent?.isBone ? x.parent : null; } return c; };
    const lca = (a: any, b: any) => { const s = new Set(chainUp(b)); return chainUp(a).find((x: any) => s.has(x)); };
    const childToward = (anc: any, leaf: any) => { const ch = chainUp(leaf); const i = ch.indexOf(anc); return i > 0 ? ch[i - 1] : leaf; };
    const leaves = skel.bones.filter((b: any) => kids(b).length === 0);
    if (leaves.length < 2) return null;
    // LEGS: two lowest leaves that are horizontally apart = the feet
    const byLow = leaves.slice().sort((a: any, b: any) => wp.get(a)!.y - wp.get(b)!.y);
    const foot1 = byLow[0];
    const foot2 = byLow.find((b: any) => b !== foot1 && Math.abs(wp.get(b)!.x - wp.get(foot1)!.x) > H * 0.04);
    if (!foot2) return null;
    const pelvis = lca(foot1, foot2); if (!pelvis) return null;
    let L = childToward(pelvis, foot1), R = childToward(pelvis, foot2);
    if (wp.get(L)!.x > wp.get(R)!.x) { const t = L; L = R; R = t; }   // L = left side
    if (!L || !R || L === R) return null;
    // ARMS: two widest upper leaves = the hands → shoulders are the chest's children toward them
    const upper = leaves.filter((b: any) => wp.get(b)!.y > yMin + H * 0.45);
    const byWide = upper.slice().sort((a: any, b: any) => Math.abs(wp.get(b)!.x - cx) - Math.abs(wp.get(a)!.x - cx));
    const hand1 = byWide[0];
    const hand2 = hand1 && byWide.find((b: any) => b !== hand1 && (wp.get(b)!.x - cx) * (wp.get(hand1)!.x - cx) < 0);
    let armL: any = null, armR: any = null;
    if (hand1 && hand2) {
      const chest = lca(hand1, hand2);
      if (chest) { let a = childToward(chest, hand1), c = childToward(chest, hand2); if (wp.get(a)!.x > wp.get(c)!.x) { const t = a; a = c; c = t; } armL = a; armR = c; }
    }
    return { L, R, Lr: L.quaternion.clone(), Rr: R.quaternion.clone(), armR, armRr: armR ? armR.quaternion.clone() : null, armL, armLr: armL ? armL.quaternion.clone() : null, ax: new THREE.Vector3(1, 0, 0) };
  }
  swingArm(rig: any, which: 'L' | 'R', amt: number) {
    const arm = which === 'L' ? rig.armL : rig.armR, rest = which === 'L' ? rig.armLr : rig.armRr;
    if (!arm) return;
    arm.quaternion.copy(rest).premultiply(new THREE.Quaternion().setFromAxisAngle(rig.ax, amt));
  }
  stepLegs(rig: any, phase: number, amp: number) {
    const qL = new THREE.Quaternion().setFromAxisAngle(rig.ax, Math.sin(phase) * amp);
    const qR = new THREE.Quaternion().setFromAxisAngle(rig.ax, Math.sin(phase + Math.PI) * amp);
    rig.L.quaternion.copy(rig.Lr).premultiply(qL);   // swing in pelvis space = forward/back
    rig.R.quaternion.copy(rig.Rr).premultiply(qR);
  }
  chopArm(rig: any, amt: number) {                   // swing the tool arm back and forth = "working"
    if (!rig?.armR) return;
    const q = new THREE.Quaternion().setFromAxisAngle(rig.ax, amt);
    rig.armR.quaternion.copy(rig.armRr).premultiply(q);
  }
  // find a turret's rotating hub bone = the central common ancestor of the far-out barrel-tip bones
  findTurret(root: THREE.Object3D): any {
    let skel: any = null;
    root.traverse((o: any) => { if (o.isSkinnedMesh && !skel) skel = o.skeleton; });
    if (!skel || !skel.bones?.length) return null;
    root.updateWorldMatrix(true, true);
    const wp = new Map<any, THREE.Vector3>();
    skel.bones.forEach((b: any) => { const p = new THREE.Vector3(); b.getWorldPosition(p); wp.set(b, p); });
    const xs = [...wp.values()].map((p) => p.x), zs = [...wp.values()].map((p) => p.z), ys = [...wp.values()].map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const H = (Math.max(...ys) - Math.min(...ys)) || 1;
    const parents = new Set(); skel.bones.forEach((b: any) => { if (b.parent?.isBone) parents.add(b.parent); });
    const tips = skel.bones.filter((b: any) => !parents.has(b)).filter((b: any) => { const p = wp.get(b)!; return Math.hypot(p.x - cx, p.z - cz) > H * 0.22; });
    if (!tips.length) return null;
    const chain = (b: any) => { const c: any[] = []; let x = b; while (x) { c.push(x); x = x.parent?.isBone ? x.parent : null; } return c; };
    let common = chain(tips[0]);
    for (let i = 1; i < tips.length; i++) { const s = new Set(chain(tips[i])); common = common.filter((b: any) => s.has(b)); }
    const central = common.filter((b: any) => { const p = wp.get(b)!; return Math.hypot(p.x - cx, p.z - cz) < H * 0.2; });
    const swivel = central[0] || common[0];
    if (!swivel) return null;
    swivel.updateWorldMatrix(true, false);
    const inv = swivel.matrixWorld.clone().invert();
    const flashLocal = new THREE.Vector3();
    tips.forEach((b: any) => flashLocal.add(wp.get(b)!.clone().applyMatrix4(inv)));
    flashLocal.multiplyScalar(1 / tips.length);
    return { swivel, rest: swivel.quaternion.clone(), flashLocal };
  }
  addTurretAnim(gm: THREE.Object3D, anim: Anim[]) {
    const tr = this.findTurret(gm); if (!tr) return;
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(), color: 0xffd25e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    flash.position.copy(tr.flashLocal); flash.position.y += 0.15; flash.scale.setScalar(0.02); flash.renderOrder = 5; tr.swivel.add(flash);
    gm.userData.turret = tr; gm.userData.flash = flash;          // expose so the battle loop can aim/fire it
    const phase = Math.random() * 6; const E = new THREE.Euler(), Q = new THREE.Quaternion();
    anim.push((t: number) => {
      if (this.battle) return;                                   // battle loop owns the turret until endBattle()
      const yaw = Math.tanh(Math.sin(t * 0.5 + phase) * 2.6) * 0.6;   // robot scan: holds at each end (pauses), snaps between — like a machine
      E.set(0, yaw, 0); Q.setFromEuler(E);
      tr.swivel.quaternion.copy(tr.rest).premultiply(Q);
      (flash.material as any).opacity = 0;
    });
  }
  // Laser Turret idle FX: a pulsing electric orb + flickering lightning arcs at the peak
  addSpireFX(gm: THREE.Object3D, anim: Anim[], topY: number) {
    const host = gm.parent || gm;   // attach to the UNSCALED building group so topY is in world units (gm is scaled by fitWidth)
    const y = topY + 0.35;
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(), color: 0xc06bff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    orb.position.y = y; orb.scale.setScalar(1.0); orb.renderOrder = 7; host.add(orb);
    const seg = 7, bolts: THREE.Line[] = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((seg + 1) * 3), 3));
      const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf0d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
      ln.position.y = y; ln.renderOrder = 7; host.add(ln); bolts.push(ln);
    }
    anim.push((t: number) => {
      orb.scale.setScalar(0.85 + Math.sin(t * 7) * 0.2);
      (orb.material as any).opacity = 0.6 + Math.sin(t * 10) * 0.32;
      const flick = (t % 0.32) < 0.17;                         // crackle often
      bolts.forEach((ln, i) => {
        (ln.material as any).opacity = flick ? 0.75 + Math.random() * 0.25 : 0.1;   // always faintly lit, bright on crackle
        const a = (ln.geometry.getAttribute('position') as any).array as Float32Array, ang = (i / 3) * Math.PI * 2 + t * 3;
        for (let s = 0; s <= seg; s++) { const f = s / seg; a[s * 3] = Math.cos(ang) * 0.5 * f + (Math.random() - 0.5) * 0.24; a[s * 3 + 1] = 0.3 - f * 0.95; a[s * 3 + 2] = Math.sin(ang) * 0.5 * f + (Math.random() - 0.5) * 0.24; }
        (ln.geometry.getAttribute('position') as any).needsUpdate = true;
      });
    });
  }
  tintGold(o: THREE.Object3D) {   // warm gold tint over the steel texture so gold buildings read as GOLD
    const gold = new THREE.Color(0xffb733);
    o.traverse((m: any) => {
      if (!m.isMesh || !m.material) return;
      const tint = (mt: any) => { const c = mt.clone(); if (c.color) c.color.lerp(gold, 0.6); if (c.emissive) { c.emissive.setHex(0x3a2400); c.emissiveIntensity = Math.max(c.emissiveIntensity ?? 0, 0.22); } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
    });
  }
  // higher building level → progressively GOLD + a premium glow (Command Core, defenses, everything)
  tintByLevel(o: THREE.Object3D, level: number) {
    if (level <= 1) return;
    const amt = Math.min(0.55, (level - 1) * 0.11);   // L2 .11 … L6 .55
    const gold = new THREE.Color(0xffc62a), warm = new THREE.Color(0x5a3c00);
    o.traverse((m: any) => {
      if (!m.isMesh || !m.material) return;
      const tint = (mt: any) => { const c = mt.clone(); if (c.color) c.color.lerp(gold, amt); if (c.emissive) { c.emissive.lerp(warm, amt * 0.7); c.emissiveIntensity = Math.max(c.emissiveIntensity ?? 0, amt * 0.55); } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
    });
  }
  // MAX-level Laser Turret: cyan electric current pulsing over the whole building (added to elecWallMats for the frame pulse)
  electrify(o: THREE.Object3D) {
    const cyan = 0x55ddff;
    o.traverse((m: any) => {
      if (!m.isMesh || !m.material) return;
      const z = (mt: any) => { const c = mt.clone(); if (c.emissive) { c.emissive.setHex(cyan); c.emissiveIntensity = 0.9; this.elecWallMats.push(c); } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(z) : z(m.material);
    });
  }
  // higher troop (research) level → bigger + a fierce hot glow
  scaleTroopByLevel(mesh: THREE.Object3D, level: number) {
    if (level <= 1) return;
    mesh.scale.multiplyScalar(1 + (level - 1) * 0.09);     // +9% size per level
    const amt = Math.min(0.45, (level - 1) * 0.11), hot = new THREE.Color(0xff5a22);
    mesh.traverse((m: any) => {
      if (!m.isMesh || !m.material) return;
      const tint = (mt: any) => { const c = mt.clone(); if (c.emissive) { c.emissive.lerp(hot, amt); c.emissiveIntensity = Math.max(c.emissiveIntensity ?? 0, amt * 0.8); } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
    });
  }
  fitMax(obj: THREE.Object3D, s: number): number {
    const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(s / (Math.max(sz.x, sz.y, sz.z) || 1));
    const b2 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= b2.min.y;
    obj.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
    return s;
  }
  fitWidth(obj: THREE.Object3D, w: number, baseY = 0): number {
    const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(w / (Math.max(sz.x, sz.z) || 1));
    const b2 = new THREE.Box3().setFromObject(obj);
    obj.position.y += baseY - b2.min.y;
    obj.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return baseY + (b2.max.y - b2.min.y);
  }
  fitHeight(obj: THREE.Object3D, h: number): number {
    const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(h / (sz.y || 1));
    const b2 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= b2.min.y;
    obj.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
    return h;
  }

  // soft round contact shadow (a dark radial blob) — makes units read as grounded
  blobTex(): THREE.Texture {
    if (this._blobTex) return this._blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!; const grd = g.createRadialGradient(32, 32, 3, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.32)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this._blobTex = new THREE.CanvasTexture(c); return this._blobTex;
  }
  groundBlob(r: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: this.blobTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 2; return m;
  }

  buildMesh(group: THREE.Group, type: string, size: number, level: number): number {
    const anim: Anim[] = [];
    const bodyCol = BODY[type] ?? C.body;                     // vivid per-type color
    const fw = size * 0.92;                                   // footprint width
    // use a custom GLB model if one was uploaded for this type
    const gm = this.modelFor(type);
    if (gm) {
      group.add(gm); group.userData.anim = anim;
      const lvlScale = 1 + (level - 1) * 0.045;                                    // bigger as it levels up (Command Core + defenses + all)
      const h = this.fitWidth(gm, fw * 1.15 * lvlScale, 0);
      if (type === 'cannon' || type === 'mortar') this.addTurretAnim(gm, anim);   // Rail Cannon + Bomber Spire — robot turret movement
      if (type === 'archer_tower') this.addSpireFX(gm, anim, h);                   // Laser Turret — electric crackle at the peak
      if (type === 'gold_mine' || type === 'gold_storage') this.tintGold(gm);   // gold buildings read as GOLD, not grey steel
      this.tintByLevel(gm, level);                                                // higher level → progressively GOLD + premium glow
      const maxLv = Math.max(...Object.keys(DEF[type]?.levels || { 1: 0 }).map(Number));
      if (type === 'archer_tower' && level >= maxLv) this.electrify(gm);          // MAX Laser Turret → the whole building is electrified
      return h + 0.6;
    }
    // shared platform every structure sits on
    const pad = cyl(fw * 0.52, fw * 0.58, 0.4, mat(C.bodyDark, { metal: 0.9, rough: 0.5 }), size <= 1 ? 6 : 6, 0, 0.2, 0);
    group.add(pad);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(fw * 0.55, 0.05, 8, 6), glow(C.cyan, 1.0));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.42; group.add(rim);
    let top = 4;

    switch (type) {
      case 'town_hall': {
        group.add(box(fw * 0.7, 1.6, fw * 0.7, mat(bodyCol, { metal: 0.9 }), 0, 1.2, 0));
        group.add(cyl(fw * 0.34, fw * 0.42, 2.4, mat(C.steel), 8, 0, 3.0, 0));
        const seam = new THREE.Mesh(new THREE.TorusGeometry(fw * 0.36, 0.06, 8, 8), glow(C.cyan, 1.2));
        seam.rotation.x = Math.PI / 2; seam.position.y = 2.6; group.add(seam);
        const core = sph(0.78, glow(C.cyan, 1.6), 0, 4.6, 0); group.add(core);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.09, 10, 32), glow(C.magenta, 1.3));
        ring.position.y = 4.6; group.add(ring);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 10, 32), glow(C.lime, 1.1));
        ring2.position.y = 4.6; ring2.rotation.x = Math.PI / 2.5; group.add(ring2);
        group.add(cyl(0.05, 0.05, 1.4, glow(C.magenta, 1.2), 6, 0, 6.0, 0));
        group.add(sph(0.16, glow(C.magenta, 1.6), 0, 6.7, 0));
        anim.push((t) => { core.scale.setScalar(0.9 + Math.sin(t * 2.4) * 0.12); ring.rotation.z = t * 0.8; ring.rotation.x = t * 0.4; ring2.rotation.y = -t * 1.1; });
        top = 7.2; break;
      }
      case 'cannon': {
        group.add(cyl(fw * 0.4, fw * 0.46, 0.9, mat(bodyCol), 16, 0, 0.85, 0));
        const turret = new THREE.Group(); turret.position.y = 1.5; group.add(turret);
        turret.add(box(1.0, 0.8, 1.2, mat(C.steel)));
        const barrelMat = mat(C.bodyDark, { metal: 0.95 });
        const b1 = cyl(0.16, 0.16, 1.8, barrelMat, 12, -0.28, 0.1, 0.9); b1.rotation.x = Math.PI / 2; turret.add(b1);
        const b2 = cyl(0.16, 0.16, 1.8, barrelMat, 12, 0.28, 0.1, 0.9); b2.rotation.x = Math.PI / 2; turret.add(b2);
        const tip1 = sph(0.18, glow(C.cyan, 1.5), -0.28, 0.1, 1.8); turret.add(tip1);
        const tip2 = sph(0.18, glow(C.cyan, 1.5), 0.28, 0.1, 1.8); turret.add(tip2);
        anim.push((t) => { turret.rotation.y = Math.sin(t * 0.6) * 0.8; const p = 1 + Math.sin(t * 5) * 0.25; tip1.scale.setScalar(p); tip2.scale.setScalar(p); });
        top = 2.6; break;
      }
      case 'archer_tower': {
        group.add(cyl(fw * 0.22, fw * 0.34, 3.6, mat(bodyCol), 10, 0, 2.0, 0));
        for (let i = 1; i <= 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(fw * 0.24, 0.04, 6, 16), glow(C.cyan, 0.9)); r.rotation.x = Math.PI / 2; r.position.y = i * 0.95; group.add(r); }
        group.add(cyl(fw * 0.4, fw * 0.3, 0.5, mat(C.steel), 10, 0, 3.9, 0));
        const orb = sph(0.5, glow(C.cyan, 1.7), 0, 4.8, 0); group.add(orb);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 24), glow(C.purple, 1.2)); ring.position.y = 4.8; group.add(ring);
        anim.push((t) => { orb.position.y = 4.8 + Math.sin(t * 2) * 0.18; orb.scale.setScalar(0.9 + Math.sin(t * 3) * 0.1); ring.rotation.z = t * 1.2; ring.rotation.y = t * 0.7; });
        top = 5.6; break;
      }
      case 'mortar': {
        group.add(cyl(fw * 0.44, fw * 0.5, 1.0, mat(bodyCol), 16, 0, 0.9, 0));
        const base = new THREE.Group(); base.position.y = 1.4; group.add(base);
        const tube = cyl(0.55, 0.7, 1.8, mat(C.bodyDark, { metal: 0.95 }), 16); tube.rotation.x = -0.5; tube.position.set(0, 0.6, 0); base.add(tube);
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 8, 18), glow(C.magenta, 1.3)); mouth.position.set(0, 1.3, 0.7); mouth.rotation.x = -0.5 + Math.PI / 2; base.add(mouth);
        anim.push((t) => { base.rotation.y = Math.sin(t * 0.4) * 0.6; mouth.scale.setScalar(0.9 + Math.sin(t * 4) * 0.15); });
        top = 3.2; break;
      }
      case 'gold_mine': {
        group.add(box(fw * 0.7, 1.1, fw * 0.7, mat(bodyCol), 0, 0.95, 0));
        // A-frame rig
        const legM = mat(C.steel);
        const l1 = box(0.16, 2.4, 0.16, legM, -0.6, 1.9, 0.6); l1.rotation.z = 0.3; group.add(l1);
        const l2 = box(0.16, 2.4, 0.16, legM, 0.6, 1.9, 0.6); l2.rotation.z = -0.3; group.add(l2);
        const drill = cyl(0.05, 0.5, 1.2, mat(C.ore, { emissive: C.ore, emI: 0.4, metal: 0.9 }), 10, 0, 1.0, 0.6);
        group.add(drill);
        for (const [x, z, r] of [[-0.6, -0.5, 0.34], [0.4, -0.7, 0.26], [0.7, -0.2, 0.22]] as any)
          group.add(sph(r, glow(C.ore, 0.8), x, 0.95 + r * 0.6, z));
        anim.push((t) => { drill.rotation.y = t * 6; });
        top = 3.2; break;
      }
      case 'elixir_collector': {
        const tank = cyl(fw * 0.34, fw * 0.34, 2.2, mat(C.plasma, { transparent: true, opacity: 0.55, emissive: C.plasma, emI: 0.5, metal: 0.2, rough: 0.1 }), 20, 0, 1.7, 0);
        group.add(tank);
        const liquid = cyl(fw * 0.3, fw * 0.3, 1.6, glow(C.plasma, 0.9), 20, 0, 1.45, 0); group.add(liquid);
        group.add(new THREE.Mesh(new THREE.TorusGeometry(fw * 0.34, 0.07, 8, 20), glow(C.purple, 1.0)).translateY(2.8));
        group.add(cyl(0.12, 0.12, 1.2, mat(C.steel), 8, -fw * 0.4, 1.2, 0));
        const bubble = sph(0.25, glow(C.plasma, 1.4), 0, 3.0, 0); group.add(bubble);
        anim.push((t) => { (liquid.material as any).emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.4; bubble.position.y = 2.9 + Math.abs(Math.sin(t * 2)) * 0.4; });
        top = 3.6; break;
      }
      case 'gold_storage': {
        group.add(box(fw * 0.66, 2.2, fw * 0.66, mat(bodyCol, { metal: 0.95 }), 0, 1.5, 0));
        for (const v of [0.9, 1.5, 2.1]) group.add(box(fw * 0.68, 0.08, fw * 0.68, glow(C.ore, 0.9), 0, v, 0));
        group.add(box(fw * 0.5, 0.5, fw * 0.5, mat(C.steel), 0, 2.85, 0));
        for (const [x, z] of [[0, 0], [0.4, 0.2], [-0.35, 0.25], [0.1, -0.3]] as any) group.add(sph(0.18, glow(C.ore, 1.0), x, 3.2, z));
        top = 3.6; break;
      }
      case 'elixir_storage': {
        const cap = cyl(fw * 0.38, fw * 0.38, 2.6, mat(C.purple, { transparent: true, opacity: 0.5, emissive: C.plasma, emI: 0.5, metal: 0.2, rough: 0.1 }), 20, 0, 1.9, 0);
        group.add(cap);
        const core = cyl(fw * 0.26, fw * 0.26, 2.2, glow(C.plasma, 1.0), 16, 0, 1.7, 0); group.add(core);
        group.add(cyl(fw * 0.42, fw * 0.42, 0.4, mat(C.steel), 20, 0, 3.3, 0));
        anim.push((t) => { (core.material as any).emissiveIntensity = 0.7 + Math.sin(t * 2.5) * 0.5; core.rotation.y = t * 0.8; });
        top = 3.8; break;
      }
      case 'army_camp': {            // Mech Bay = the "house" (10 troop slots)
        group.add(box(fw * 0.92, 0.3, fw * 0.92, mat(C.bodyDark), 0, 0.5, 0));
        // open hangar arch
        const arch = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.22, 10, 20, Math.PI), mat(bodyCol, { metal: 0.9 }));
        arch.position.set(0, 0.65, -0.6); group.add(arch);
        // landing-pad lights
        const lights: THREE.Mesh[] = [];
        for (const [x, z] of [[-1.1, 1.0], [1.1, 1.0], [-1.1, -0.2], [1.1, -0.2]] as any) { const l = sph(0.12, glow(C.cyan, 1.2), x, 0.7, z); group.add(l); lights.push(l); }
        // two parked robots
        const bot = (x: number, col: number) => { const g = new THREE.Group(); g.position.set(x, 0.65, 0.4); g.add(box(0.5, 0.6, 0.4, mat(C.steel))); g.add(box(0.4, 0.4, 0.35, mat(bodyCol), 0, 0.5, 0)); g.add(sph(0.08, glow(col, 1.5), 0, 0.55, 0.18)); group.add(g); return g; };
        const b1 = bot(-0.7, C.cyan), b2 = bot(0.7, C.magenta);
        anim.push((t) => { lights.forEach((l, i) => l.scale.setScalar(0.6 + Math.abs(Math.sin(t * 3 + i)) * 0.7)); b1.position.y = 0.65 + Math.sin(t * 2) * 0.05; b2.position.y = 0.65 + Math.sin(t * 2 + 1) * 0.05; });
        top = 2.4; break;
      }
      case 'barracks': {             // Robot Factory
        group.add(box(fw * 0.7, 1.8, fw * 0.7, mat(bodyCol), 0, 1.3, 0));
        group.add(box(fw * 0.74, 0.12, fw * 0.74, glow(C.magenta, 0.9), 0, 1.0, 0));
        // chimney emitting energy
        const chimney = cyl(0.28, 0.32, 1.4, mat(C.steel), 10, fw * 0.22, 2.7, -fw * 0.18); group.add(chimney);
        const smoke = sph(0.22, glow(C.lime, 1.0), fw * 0.22, 3.6, -fw * 0.18); group.add(smoke);
        // assembly arm
        const arm = new THREE.Group(); arm.position.set(-fw * 0.1, 2.3, 0); group.add(arm);
        arm.add(box(0.12, 0.12, 1.1, mat(C.steel), 0, 0, 0.5));
        arm.add(sph(0.16, glow(C.cyan, 1.4), 0, 0, 1.05));
        anim.push((t) => { arm.rotation.y = Math.sin(t * 1.5) * 0.7; smoke.position.y = 3.4 + (t % 1.2) * 0.6; smoke.scale.setScalar(1 - (t % 1.2) * 0.6); });
        top = 4.0; break;
      }
      case 'builders_hut': {         // Drone Bay
        group.add(cyl(fw * 0.42, fw * 0.46, 0.9, mat(bodyCol), 8, 0, 0.85, 0));
        const dome = sph(fw * 0.4, mat(C.steel, { metal: 0.9 }), 0, 1.3, 0); dome.scale.y = 0.6; group.add(dome);
        group.add(cyl(0.04, 0.04, 0.7, glow(C.cyan, 1.2), 6, 0, 2.0, 0));
        const drone = new THREE.Group(); drone.position.set(0, 2.4, 0); group.add(drone);
        drone.add(box(0.3, 0.14, 0.3, mat(C.steel))); drone.add(sph(0.06, glow(C.lime, 1.6), 0, 0, 0.16));
        anim.push((t) => { drone.position.y = 2.4 + Math.sin(t * 2.5) * 0.2; drone.rotation.y = t * 2; });
        top = 3.0; break;
      }
      case 'wall': {                 // Force Barrier — taller/thicker/brighter per level
        group.children.length = 0;   // no big pad for walls
        const col = WALLTONE[Math.min(4, Math.max(0, level - 1))];
        const h = 1.0 + level * 0.22;
        const postW = 0.15 + level * 0.03;
        group.add(box(0.92, 0.4 + level * 0.05, 0.92, mat(C.steel, { metal: 0.9 }), 0, 0.22, 0));
        const fy = 0.4 + h / 2;
        const field = box(0.76, h, 0.16, mat(col, { transparent: true, opacity: 0.5, emissive: col, emI: 1.3, metal: 0.1, rough: 0.2 }), 0, fy, 0);
        group.add(field);
        group.add(box(postW, h + 0.4, postW, mat(C.bodyDark, { metal: 0.8 }), -0.46, 0.4 + (h + 0.4) / 2 - 0.2, 0));
        group.add(box(postW, h + 0.4, postW, mat(C.bodyDark, { metal: 0.8 }), 0.46, 0.4 + (h + 0.4) / 2 - 0.2, 0));
        if (level >= 3) group.add(box(0.98, 0.12, 0.98, glow(col, 1.2), 0, 0.4 + h + 0.08, 0));  // glowing cap
        anim.push((t) => { (field.material as any).opacity = 0.35 + Math.abs(Math.sin(t * 3)) * 0.35; });
        top = 0.4 + h + 0.6; break;
      }
      default:
        group.add(box(fw * 0.6, 1.4, fw * 0.6, mat(bodyCol), 0, 1.0, 0));
        top = 2.4;
    }
    group.userData.anim = anim;
    return top + 0.6;
  }

  // ---------- ghost (placement preview) ----------
  setBuildMode(m: string | null) {
    this.buildMode = m;
    this.ghost.clear();
    if (!m || !DEF[m]) return;
    const size = DEF[m].size;
    const footprint = new THREE.Mesh(
      new THREE.BoxGeometry(size, 0.1, size),
      new THREE.MeshBasicMaterial({ color: C.lime, transparent: true, opacity: 0.35 }),
    );
    footprint.position.y = 0.06; this.ghost.add(footprint);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 1.2, size)),
      new THREE.LineBasicMaterial({ color: C.lime }),
    );
    outline.position.y = 0.6; this.ghost.add(outline);
    this.ghost.userData = { size, footprint, outline };
  }
  updateGhost() {
    if (!this.buildMode || !this.ghost.userData?.size) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    const size = this.ghost.userData.size;
    const gx = Math.round(this.hover.fx - size / 2), gy = Math.round(this.hover.fy - size / 2);
    this.ghost.position.copy(this.worldCenter(gx, gy, size));
    const ok = this.canPlace(gx, gy, size);
    const col = ok ? C.lime : C.magenta;
    (this.ghost.userData.footprint.material as THREE.MeshBasicMaterial).color.setHex(col);
    (this.ghost.userData.outline.material as THREE.LineBasicMaterial).color.setHex(col);
  }
  canPlace(x: number, y: number, size: number) {
    if (x < 1 || y < 1 || x + size > GRID - 1 || y + size > GRID - 1) return false;
    for (const b of this.state?.buildings || []) {
      const bs = DEF[b.type].size;
      if (x < b.gridX + bs && x + size > b.gridX && y < b.gridY + bs && y + size > b.gridY) return false;
    }
    return true;
  }
  buildingAt(tx: number, ty: number) {
    return this.state?.buildings.find((b: any) => { const s = DEF[b.type].size; return tx >= b.gridX && tx < b.gridX + s && ty >= b.gridY && ty < b.gridY + s; });
  }
  buildingAtPointer() {
    const p = this.pointerToGround(); if (!p) return null;
    return this.buildingAt(Math.floor(p.x + GRID / 2), Math.floor(p.z + GRID / 2));
  }
  // info tooltip on hover (name · level · HP); click still opens the full dialog
  updateBuildingHover(cx: number, cy: number, busy: boolean) {
    const tip = this.hoverTip; if (!tip) return;
    if (busy || this.buildMode || this.dragItem || (this.battle && !this.battle.ended)) { tip.style.display = 'none'; return; }
    const it: any = this.buildingAtPointer();
    if (!it) { tip.style.display = 'none'; this.el.style.cursor = ''; return; }
    const b = it.b, def = DEF[b.type], L = Math.max(1, b.level);
    const hp = b.type === 'town_hall' ? TH[String(L)]?.hp : def.levels?.[String(L)]?.hp;
    tip.innerHTML = `<b>${def.name}</b> · Lv ${L}${hp ? ` · 🛡️ ${hp}` : ''}`;
    tip.style.left = cx + 'px'; tip.style.top = cy + 'px'; tip.style.display = '';
    this.el.style.cursor = 'pointer';
  }
  // live-drag a placed building to follow the cursor (snapped to the grid)
  dragTo() {
    const it = this.dragItem; if (!it) return;
    const p = this.pointerToGround(); if (!p) return;
    const size = DEF[it.b.type].size;
    let gx = Math.round(p.x + GRID / 2 - size / 2), gy = Math.round(p.z + GRID / 2 - size / 2);
    gx = Math.max(1, Math.min(GRID - 1 - size, gx)); gy = Math.max(1, Math.min(GRID - 1 - size, gy));
    it.dragX = gx; it.dragY = gy;
    it.group.position.copy(this.worldCenter(gx, gy, size));
  }
  commitDrag() {
    const it = this.dragItem; if (!it || it.dragX == null) return;
    if (it.dragX !== it.b.gridX || it.dragY !== it.b.gridY) this.onMove(it.b, it.dragX, it.dragY);
  }
  showDragRing(on: boolean) {   // glowing pick-up indicator under the grabbed building
    const it = this.dragItem; if (!it) return;
    const ex = it.group.getObjectByName('__dragring');
    if (on && !ex) {
      const s = DEF[it.b.type].size;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.6, 0.07, 8, 28), glow(0x9bff3b, 1.9));
      ring.name = '__dragring'; ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
      it.group.add(ring);
    } else if (!on && ex) { it.group.remove(ex); }
  }

  // ---------- input ----------
  bindInput() {
    const dom = this.renderer.domElement;
    let mode: 'none' | 'pan' | 'rotate' | 'drag' = 'none', moved = false, lx = 0, ly = 0, pinchD = 0;
    const setPtr = (cx: number, cy: number) => {
      const r = dom.getBoundingClientRect();
      this.ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    };
    const pan = (dx: number, dy: number) => {
      const k = this.cam.dist * 0.0016;
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
      this.cam.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
      this.updateCamera();
    };
    const rotate = (dx: number, dy: number) => {
      if (this.autoOrbit) { this.autoOrbit = false; this.onOrbit?.(false); }   // manual drag takes over from auto-spin
      this.cam.azim -= dx * 0.005;
      this.cam.elev = Math.max(0.28, Math.min(1.45, this.cam.elev - dy * 0.005));
      this.updateCamera();
    };

    const grabAt = (cx: number, cy: number) => {   // start dragging a building if the pointer is on one
      if (this.buildMode || (this.battle && !this.battle.ended)) return null;
      setPtr(cx, cy);
      const b = this.buildingAtPointer();
      if (!b || b.type === 'town_hall' || b.level < 1) return null;
      return this.items.find((i: any) => i.b.id === b.id) || null;
    };

    dom.addEventListener('mousedown', (e) => {
      moved = false; lx = e.clientX; ly = e.clientY;
      if (e.button === 0) { const it = grabAt(e.clientX, e.clientY); if (it) { mode = 'drag'; this.dragItem = it; this.dragItem.dragX = null; this.showDragRing(true); return; } }
      mode = e.button === 0 ? 'pan' : 'rotate';
    });
    window.addEventListener('mousemove', (e) => {
      setPtr(e.clientX, e.clientY); this.updateHoverFromPointer(); this.updateBuildingHover(e.clientX, e.clientY, mode !== 'none');
      if (mode === 'none') return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (mode === 'drag') { this.dragTo(); return; }
      mode === 'pan' ? pan(dx, dy) : rotate(dx, dy);
    });
    window.addEventListener('mouseup', (e) => {
      if (mode === 'drag' && this.dragItem) { this.showDragRing(false); if (moved) this.commitDrag(); else { this.pokeWorkers(this.dragItem.b); this.onSelect(this.dragItem.b); } this.dragItem = null; }
      else if (mode !== 'none' && !moved && e.button === 0) { setPtr(e.clientX, e.clientY); this.click(); }
      mode = 'none';
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.dist = Math.max(12, Math.min(95, this.cam.dist * (e.deltaY < 0 ? 0.9 : 1.1))); this.updateCamera(); }, { passive: false });

    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        moved = false; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        const it = grabAt(lx, ly); if (it) { mode = 'drag'; this.dragItem = it; this.dragItem.dragX = null; this.showDragRing(true); return; }
        mode = 'pan'; setPtr(lx, ly); this.updateHoverFromPointer();
      } else if (e.touches.length === 2) { mode = 'rotate'; pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && (mode === 'pan' || mode === 'drag')) {
        const t = e.touches[0], dx = t.clientX - lx, dy = t.clientY - ly; lx = t.clientX; ly = t.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; setPtr(t.clientX, t.clientY);
        if (mode === 'drag') { this.dragTo(); return; }
        this.updateHoverFromPointer(); pan(dx, dy);
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchD) { this.cam.dist = Math.max(12, Math.min(95, this.cam.dist * (pinchD / d))); this.updateCamera(); }
        pinchD = d; moved = true;
      }
    }, { passive: true });
    dom.addEventListener('touchend', () => {
      if (mode === 'drag' && this.dragItem) { this.showDragRing(false); if (moved) this.commitDrag(); else { this.pokeWorkers(this.dragItem.b); this.onSelect(this.dragItem.b); } this.dragItem = null; }
      else if (mode === 'pan' && !moved) this.click();
      mode = 'none'; pinchD = 0;
    });
  }

  click() {
    const p = this.pointerToGround(); if (!p) return;
    if (this.battle && !this.battle.ended) { if (!this.battle.replay) this.deployTroop(p.x, p.z); return; }   // replay = watch only
    const fx = p.x + GRID / 2, fy = p.z + GRID / 2;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    if (this.buildMode) {
      const size = DEF[this.buildMode].size;
      this.onPlace(this.buildMode, Math.round(fx - size / 2), Math.round(fy - size / 2));
      return;
    }
    const picked = this.buildingAt(tx, ty) || null;
    if (picked) this.pokeWorkers(picked);
    this.onSelect(picked);
  }

  // ====================== BATTLE (M3) ======================
  startBattle(enemy: any, army: Record<string, number>, opts: any = {}) {
    this.state = { player: { serverTime: Date.now() }, buildings: enemy.buildings };
    this.sig = ''; this.rebuild();
    this.buildMode = null; this.ghost.clear();
    this.disposeFx(); this.troopLayer.clear(); this.fxLayer.clear(); this.beams = []; this.particles = [];
    if (this.npLayer) this.npLayer.innerHTML = '';   // reset battle nameplates
    this.workerLayer.clear(); this.workers = [];     // no workers on the enemy battlefield
    this.cam.dist = 62; this.cam.target.set(0, 0, 0); this.updateCamera();

    const bs = this.items.map((it) => {
      const def = DEF[it.b.type];
      const o: any = {
        id: it.b.id, type: it.b.type, group: it.group, size: def.size, anchorY: it.anchorY,
        cx: it.group.position.x, cz: it.group.position.z,
        hp: it.b.hp ?? 400, maxHp: it.b.maxHp ?? it.b.hp ?? 400,
        isDefense: def.category === 'defense', isWall: it.b.type === 'wall', destroyed: false,
      };
      o.np = this.makeNameplate(def.name || it.b.type, def.category !== 'wall');   // name + HP bar + numbers (walls: bar only)
      if (o.isDefense) {                                          // grab the riggable turret (cannon) + a muzzle height
        it.group.traverse((n: any) => { if (n.userData?.turret) { o.turret = n.userData.turret; o.flash = n.userData.flash; } });
        o.muzzleY = (it.anchorY || 2) * 0.82; o._recoil = 0;
      }
      return o;
    });
    this.battle = {
      army: { ...army }, deployed: {}, buildings: bs, enemies: [],
      troops: [], projectiles: [], defenseCd: new Map<string, number>(),
      total: bs.filter((x) => !x.isWall).length, destroyed: 0, thDown: false,   // walls don't count
      start: performance.now(), lastT: performance.now(), lastEmit: 0, duration: 120, ended: false,
      replay: !!opts.replay, troopsTeam: opts.troopsTeam || 'mine', autoCd: 0.8,   // replay: attacker army auto-deploys; troops are the enemy's
    };
    // spawn the enemy GUARD ARMY (defends the base, fights your troops)
    const guards = enemy.guards || {}, guardLv = enemy.guardLv || 1;
    const core = bs.find((o: any) => o.type === 'town_hall'), gx = core ? core.cx : 0, gz = core ? core.cz : 0;
    for (const [type, count] of Object.entries(guards)) for (let i = 0; i < Number(count); i++) {
      const ang = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 5;
      this.spawnEnemyTroop(type, gx + Math.cos(ang) * r, gz + Math.sin(ang) * r, guardLv);
    }
    this.deployType = Object.keys(army).find((t) => army[t] > 0) || null;
    this.emitBattle();
  }
  spawnEnemyTroop(type: string, x: number, z: number, level: number) {
    const b = this.battle; if (!b) return;
    const cfg = troopCfg(type, level);
    const flyY = cfg.isAir ? 1.6 : (TROOP_FLY[type] || 0);
    const mesh = this.troopMesh(type); mesh.position.set(x, flyY || 0.4, z); this.scaleTroopByLevel(mesh, level); this.tintEnemy(mesh); this.troopLayer.add(mesh);
    const np = this.makeNameplate(TROOP_NAME[type] || type); np.el.classList.add('enemy');
    const npY = type === 'giant' ? 2.4 : type === 'dragon' ? 1.2 : 1.7;
    b.enemies.push({ mesh, np, npY, rig: mesh.userData.rig, phase: Math.random() * 6, atkT: 0, flyY, type, x, z, hp: cfg.hp, maxHp: cfg.hp, dps: cfg.dps, speed: cfg.speed * 0.85, range: cfg.range, isAir: cfg.isAir, target: null, cd: 0, enemy: true });
  }
  tintEnemy(mesh: THREE.Object3D) {   // red team marker: ground ring + warm tint
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20), glow(0xff3b3b, 1.8));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; mesh.add(ring);
    mesh.traverse((o: any) => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(0x661010); o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 0, 0.3); } });
  }
  setDeployType(t: string | null) { this.deployType = t; }
  endBattle() { this.battle = null; this.deployType = null; this.disposeFx(); this.troopLayer.clear(); this.fxLayer.clear(); this.beams = []; this.particles = []; if (this.npLayer) this.npLayer.innerHTML = ''; }

  troopMesh(type: string) {
    const gm = this.modelFor('troop_' + type);
    if (gm) {
      const g = new THREE.Group();
      if (type === 'dragon') this.fitMax(gm, 2.4);                     // wide flying saucer
      else this.fitHeight(gm, type === 'giant' ? 1.9 : 1.1);          // humanoids by height
      g.add(gm);
      g.userData.rig = type === 'dragon' ? null : this.findLegs(gm);   // procedural humanoid rig (walk + attack)
      return g;
    }
    const col = TCOLOR[type] || 0x46e6ff;
    const g = new THREE.Group();
    g.add(box(0.4, 0.5, 0.34, mat(0x9aa6d8, { metal: 0.4 }), 0, 0.25, 0));
    g.add(box(0.32, 0.3, 0.3, mat(0x5d6cab), 0, 0.62, 0));
    g.add(sph(0.13, glow(col, 1.7), 0, 0.64, 0.14));
    if (type === 'giant' || type === 'dragon') g.scale.setScalar(1.6);
    return g;
  }
  deployTroop(x: number, z: number) {
    const b = this.battle; if (!b || b.ended) return;
    const t = this.deployType; if (!t || !(b.army[t] > 0)) return;
    const lim = GRID / 2 - 1;
    x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    b.army[t]--; b.deployed[t] = (b.deployed[t] || 0) + 1;
    sfx.deploy();
    const cfg = troopCfg(t, this.troopLevels[t] || 1);   // use the player's researched level
    const flyY = cfg.isAir ? 1.6 : (TROOP_FLY[t] || 0);
    const mesh = this.troopMesh(t); mesh.position.set(x, flyY || 0.4, z); this.scaleTroopByLevel(mesh, this.troopLevels[t] || 1); this.troopLayer.add(mesh);
    const np = this.makeNameplate(TROOP_NAME[t] || t);   // name + HP bar + numbers
    const npY = t === 'giant' ? 2.4 : t === 'dragon' ? 1.2 : 1.7;
    b.troops.push({ mesh, np, npY, rig: mesh.userData.rig, phase: Math.random() * 6, atkT: 0, flyY, type: t, x, z, hp: cfg.hp, maxHp: cfg.hp, dps: cfg.dps, speed: cfg.speed, range: cfg.range, isAir: cfg.isAir, prefersDefense: cfg.prefersDefense, target: null, cd: 0 });
    if (b.army[t] <= 0) this.deployType = Object.keys(b.army).find((k) => b.army[k] > 0) || null;
    this.emitBattle();
  }

  nearestBuilding(pool: any[], x: number, z: number) {
    let best = null, bd = Infinity;
    for (const o of pool) { if (o.destroyed) continue; const d = (o.cx - x) ** 2 + (o.cz - z) ** 2; if (d < bd) { bd = d; best = o; } }
    return best;
  }
  spawnBolt(x0: number, z0: number, x1: number, z1: number, color: number, onHit?: () => void) {
    const m = sph(0.15, glow(color, 1.9), x0, 1.0, z0); this.fxLayer.add(m);
    if (Math.random() < 0.25) sfx.shoot();   // sparse laser ambience (avoid spam)
    this.battle.projectiles.push({ mesh: m, x: x0, z: z0, tx: x1, tz: z1, onHit, speed: 20 });
  }
  // ---- defense combat visuals ----
  aimDefense(d: any, tgt: any, now: number) {          // swivel the rigged turret (Rail Cannon) to track / idle-spin + recoil
    const tr = d.turret; if (!tr) return;
    const yaw = tgt ? Math.atan2(tgt.x - d.cx, tgt.z - d.cz) : Math.sin(now * 0.0006) * 0.42;   // aim at troop, else gentle scan (no full spin)
    this._aimE.set(-0.1 * (d._recoil || 0), yaw, 0); this._aimQ.setFromEuler(this._aimE);        // light recoil — no base distortion
    tr.swivel.quaternion.copy(tr.rest).premultiply(this._aimQ);
    if (d.flash) { (d.flash.material as any).opacity = d._recoil || 0; d.flash.scale.setScalar(0.05 + (d._recoil || 0) * 0.6); }
    d._recoil = Math.max(0, (d._recoil || 0) - 0.07);
  }
  fireDefense(d: any, tgt: any, st: any, dmg: number) {
    const my = d.muzzleY || 1.6, tx = tgt.x, tz = tgt.z, ty = tgt.isAir ? 1.6 : 0.5;
    const cap = (tr: any) => Math.min(dmg, tr.maxHp * 0.35);   // anti-instant: one shot ≤ 35% HP → every troop survives ≥3 hits
    const apply = () => {
      if (st.splash) { for (const tr of this.battle.troops) if (tr.hp > 0 && Math.hypot(tr.x - tx, tr.z - tz) <= st.splash) { const d = cap(tr); tr.hp -= d; this.spawnDamage(tr.x, (tr.npY || 1.7) + 0.3, tr.z, d); } }
      else if (tgt.hp > 0) { const d = cap(tgt); tgt.hp -= d; this.spawnDamage(tgt.x, (tgt.npY || 1.7) + 0.3, tgt.z, d); }
    };
    if (d.type === 'cannon') { d._recoil = 1; this.spawnLaser(d.cx, my, d.cz, tx, ty, tz, 0x3fd0ff, 1 + (d.level - 1) * 0.4); this.spawnFlash(tx, ty, tz, 0x9fe6ff, 0.6); apply(); }   // Rail Cannon — THICK LASER
    else if (d.type === 'mortar') {                                                                  // Bomber Spire — big round BOMB → WIDE explosion on impact
      d._recoil = 1;
      const boom = () => { this.spawnFlash(tx, 0.4, tz, 0xff8a3a, st.splash * 1.25); this.spawnFlash(tx, 0.4, tz, 0xffe08a, st.splash * 0.7); sfx.explode(); apply(); };
      this.spawnCannonball(d.cx, my, d.cz, tx, ty, tz, boom, 16, 2.4, 0.32 + (d.level - 1) * 0.08);
    }
    else if (d.type === 'archer_tower') { this.spawnLightning(d.cx, my, d.cz, tx, ty, tz, 0xd79bff, 1 + (d.level - 1) * 0.45); this.spawnShock(tx, ty, tz); apply(); }            // Laser Turret — LIGHTNING + electric shock burst on the unit
    else { this.spawnBolt(d.cx, d.cz, tx, tz, st.splash ? 0xff5cb0 : 0xffd25e, apply); }
  }
  spawnCannonball(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, onHit: () => void, speed = 15, arc = 2.6, size = 0.24) {
    const m = sph(size, mat(0x20242f, { metal: 0.85, rough: 0.35, emissive: 0xff7a2a, emI: 0.45 }), x0, y0, z0);
    m.castShadow = true; this.fxLayer.add(m);
    this.spawnFlash(x0, y0, z0, 0xffd25e, 0.75); sfx.shoot();
    const total = Math.hypot(x1 - x0, z1 - z0);
    this.battle.projectiles.push({ mesh: m, x: x0, z: z0, tx: x1, tz: z1, y0, ty: y1, total, arc, speed, onHit });
  }
  spawnFlash(x: number, y: number, z: number, color: number, size: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.radialTexture(), color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    s.position.set(x, y, z); s.scale.setScalar(size); s.renderOrder = 6; this.fxLayer.add(s);
    this.beams.push({ mesh: s, life: 0.16, max: 0.16, flash: true, grow: size * 2.4 });
  }
  spawnLaser(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, width = 1) {
    const a = new THREE.Vector3(x0, y0, z0), c = new THREE.Vector3(x1, y1, z1);
    const len = Math.max(0.1, a.distanceTo(c));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * width, 0.07 * width, len, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.copy(a).lerp(c, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
    m.renderOrder = 5; this.fxLayer.add(m);
    this.spawnFlash(x0, y0, z0, color, 0.45 * width); this.spawnFlash(x1, y1, z1, color, 0.4 * width);
    if (Math.random() < 0.4) sfx.shoot();
    this.beams.push({ mesh: m, life: 0.16, max: 0.16, beam: true });
  }
  spawnLightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, width = 1) {
    const seg = 8, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) { const f = i / seg, taper = 1 - Math.abs(f - 0.5) * 1.4; pts.push(new THREE.Vector3(x0 + (x1 - x0) * f + (Math.random() - 0.5) * 0.9 * taper, y0 + (y1 - y0) * f, z0 + (z1 - z0) * f + (Math.random() - 0.5) * 0.9 * taper)); }
    // SOLID thick bolt: tube through the jagged path (radius scales with the turret level)
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.05 * width, 6, false);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.renderOrder = 5; this.fxLayer.add(m);
    this.spawnFlash(x1, y1, z1, color, 1.0 * Math.sqrt(width)); this.spawnFlash(x0, y0, z0, color, 0.5);
    sfx.explode();
    this.beams.push({ mesh: m, life: 0.24, max: 0.24, lightning: true });   // updateBeams flickers opacity (no per-frame rebuild)
  }
  // electric-shock burst on the unit the lightning hits: white-hot flash + jagged sparks radiating out
  spawnShock(x: number, y: number, z: number, color = 0xc89bff) {
    this.spawnFlash(x, y, z, 0xffffff, 0.85);
    this.spawnFlash(x, y, z, color, 1.6);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.283, r = 0.55 + Math.random() * 0.5;
      const ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r, ey = y + (Math.random() - 0.35) * 0.7;
      const seg = 4, pts: THREE.Vector3[] = [];
      for (let j = 0; j <= seg; j++) { const f = j / seg; pts.push(new THREE.Vector3(x + (ex - x) * f + (Math.random() - 0.5) * 0.25, y + (ey - y) * f, z + (ez - z) * f + (Math.random() - 0.5) * 0.25)); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.035, 5, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.renderOrder = 6; this.fxLayer.add(m);
      this.beams.push({ mesh: m, life: 0.2, max: 0.2, lightning: true });
    }
  }
  updateBeams(dt: number) {
    if (!this.beams.length) return;
    for (const e of this.beams) {
      e.life -= dt;
      if (e.life <= 0) { if (e.mesh.parent) this.fxLayer.remove(e.mesh); if (!e.flash) (e.mesh.geometry as any)?.dispose?.(); (e.mesh.material as any)?.dispose?.(); continue; }   // flash sprites share a global geometry — don't dispose it
      const k = e.life / e.max, mtl = e.mesh.material as any;
      if (e.lightning) { mtl.opacity = (0.55 + Math.random() * 0.45) * k; if (e.posAttr) { e.mkPts(e.posAttr.array); e.posAttr.needsUpdate = true; } }
      else if (e.flash) { mtl.opacity = k; e.mesh.scale.setScalar(e.mesh.scale.x + e.grow * dt); }
      else mtl.opacity = k * 0.95;
    }
    this.beams = this.beams.filter((e) => e.life > 0);
  }
  disposeFx() {   // free GPU buffers of transient combat meshes before clearing fxLayer (flashes share the cached _radTex — never dispose .map)
    this.fxLayer.traverse((o: any) => {
      if (!o.isSprite && (o.isMesh || o.isLine) && o.geometry?.dispose) o.geometry.dispose();
      (o.material as any)?.dispose?.();
    });
  }
  // ---- troop animation + per-type attacks ----
  animTroop(tr: any, moving: boolean, now: number, dt: number) {
    if (tr.atkT > 0) tr.atkT = Math.max(0, tr.atkT - dt * 2.6);   // attack pose plays over ~0.38s
    const atk = tr.atkT;
    if (tr.type === 'dragon') { tr.mesh.rotation.z = Math.sin(now / 380) * 0.1 - atk * 0.3; return; }   // War Jet banks; rolls on fire
    const rig = tr.rig; if (!rig) return;
    if (tr.flyY) this.stepLegs(rig, now / 260, 0.16);             // gentle leg dangle while floating (Mage)
    else if (moving) { tr.phase += dt * tr.speed * 3.4; this.stepLegs(rig, tr.phase, 0.5); }   // walk cycle
    else this.stepLegs(rig, 0, 0);
    if (tr.type === 'barbarian') { const sw = -2.4 * Math.sin(atk * Math.PI); this.swingArm(rig, 'R', sw); this.swingArm(rig, 'L', sw * 0.55); }            // Fighter sword chop (both arms so the sword hand swings whichever side it's on)
    else if (tr.type === 'archer') { this.swingArm(rig, 'L', -1.45); this.swingArm(rig, 'R', -0.9 - atk * 0.7); }                                             // Archer bow draw
    else if (tr.type === 'wizard') { const c = -1.35 - atk * 0.5; this.swingArm(rig, 'L', c); this.swingArm(rig, 'R', c); }                                   // Mage two-hand cast
    else if (tr.type === 'giant') { const s = atk > 0.5 ? -2.3 * ((atk - 0.5) * 2) : 1.9 * (1 - atk * 2); this.swingArm(rig, 'L', s); this.swingArm(rig, 'R', s); }   // Titan overhead smash
  }
  troopAttack(tr: any, tx: number, tz: number) {
    tr.atkT = 1;
    const sx = tr.x, sz = tr.z, sy = tr.isAir ? 1.5 : (tr.flyY ? tr.flyY + 0.3 : 0.7);
    if (tr.type === 'archer') this.spawnArrow(sx, sy, sz, tx, tz);
    else if (tr.type === 'wizard') this.spawnMageBall(sx, sy, sz, tx, tz);
    else if (tr.type === 'dragon') this.spawnJetLaser(sx, sy, sz, tx, tz);
    else if (tr.range > 1.5) this.spawnBolt(sx, sz, tx, tz, TCOLOR[tr.type] || 0x46e6ff);   // any other ranged unit
  }
  spawnArrow(x0: number, y0: number, z0: number, x1: number, z1: number) {
    const m = box(0.05, 0.05, 0.55, glow(0xeaffc0, 1.5), x0, y0, z0); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); this.fxLayer.add(m);
    this.battle.projectiles.push({ mesh: m, x: x0, z: z0, tx: x1, tz: z1, flatY: y0, speed: 28 });
  }
  spawnMageBall(x0: number, y0: number, z0: number, x1: number, z1: number) {
    const m = sph(0.2, glow(0xb15cff, 2.1), x0, y0, z0); this.fxLayer.add(m);
    this.spawnFlash(x0, y0, z0, 0xb15cff, 0.45);
    this.battle.projectiles.push({ mesh: m, x: x0, z: z0, tx: x1, tz: z1, y0, ty: 0.7, total: Math.hypot(x1 - x0, z1 - z0), arc: 1.3, speed: 13 });
  }
  spawnJetLaser(x0: number, y0: number, z0: number, x1: number, z1: number) {
    this.spawnLaser(x0, y0, z0, x1, 0.6, z1, 0xff4d6a);          // long sustained red beam
  }
  hitBuilding(t: any, dmg: number) {
    if (t.destroyed) return;
    t.hp -= dmg;
    this.spawnDamage(t.cx, (t.anchorY || 2) * 0.7 + 0.5, t.cz, dmg);   // floating damage popup
    if (t.hp <= 0) {
      t.destroyed = true; t.group.visible = false;
      if (!t.isWall) this.battle.destroyed++;
      if (t.type === 'town_hall') this.battle.thDown = true;
      this.spawnExplosion(t.cx, t.cz, BODY[t.type] ?? C.magenta); sfx.explode();   // boom!
      this.spawnDebris(t.cx, t.cz, BODY[t.type] ?? C.magenta, Math.max(0.7, t.size * 0.5));   // leave wreckage
    }
  }
  starsFor(pct: number) { let s = 0; if (pct >= 0.2) s = 1; if (pct >= 0.5) s = 2; if (pct >= 1) s = 3; return s; }   // ⭐ 20% / 50% / 100% destroyed

  tickBattle(now: number) {
    const b = this.battle; if (!b || b.ended) return;
    const dt = Math.min(0.05, (now - b.lastT) / 1000); b.lastT = now;
    const alive = b.buildings.filter((x: any) => !x.destroyed);

    // REPLAY: the attacker's army auto-deploys from the edges over time (no manual control)
    if (b.replay) {
      b.autoCd -= dt;
      if (b.autoCd <= 0) {
        const left = Object.keys(b.army).filter((t) => b.army[t] > 0);
        if (left.length) {
          this.deployType = left[(Math.random() * left.length) | 0];
          const ang = Math.random() * Math.PI * 2, r = 14;
          this.deployTroop(Math.cos(ang) * r, Math.sin(ang) * r);
          b.autoCd = 0.45;
        }
      }
    }

    // troops: fight guards -> break walls -> target building -> move -> attack
    for (const tr of b.troops) {
      // fight an enemy guard this troop can hit (ground vs ground · ranged/air vs air — War Jet vs War Jet)
      if (b.enemies.length) {
        const en = this.nearestEnemyTarget(b.enemies, tr.x, tr.z, tr.type, tr.isAir);
        if (en && Math.hypot(en.x - tr.x, en.z - tr.z) <= tr.range + 0.7) {
          tr.mesh.rotation.y = Math.atan2(en.x - tr.x, en.z - tr.z) + (TROOP_FACE[tr.type] || 0);
          tr.cd -= dt;
          if (tr.cd <= 0) { tr.cd = 0.6; const d = Math.min(tr.dps * 0.6, en.maxHp * 0.35); en.hp -= d; this.spawnDamage(en.x, (en.npY || 1.7) + 0.3, en.z, d); this.troopAttack(tr, en.x, en.z); }
          this.animTroop(tr, false, now, dt); continue;
        }
      }
      // GROUND troops bust through any wall blocking them (air flies over)
      if (!tr.isAir) {
        const wall = this.nearestBuilding(alive.filter((x: any) => x.isWall), tr.x, tr.z);
        if (wall && Math.hypot(wall.cx - tr.x, wall.cz - tr.z) <= wall.size * 0.5 + tr.range + 0.25) {
          tr.cd -= dt; tr.mesh.rotation.y = Math.atan2(wall.cx - tr.x, wall.cz - tr.z) + (TROOP_FACE[tr.type] || 0);
          if (tr.cd <= 0) { tr.cd = 0.6; this.hitBuilding(wall, tr.dps * 0.6); this.troopAttack(tr, wall.cx, wall.cz); }
          this.animTroop(tr, false, now, dt);
          continue;   // blocked by the wall
        }
      }
      if (!tr.target || tr.target.destroyed) {
        let pool = alive.filter((x: any) => !x.isWall);          // walls handled above; aim at real buildings
        if (tr.prefersDefense) { const d = pool.filter((x: any) => x.isDefense); if (d.length) pool = d; }
        tr.target = this.nearestBuilding(pool, tr.x, tr.z);
      }
      const tgt = tr.target; if (!tgt) continue;
      const dx = tgt.cx - tr.x, dz = tgt.cz - tr.z, dist = Math.hypot(dx, dz) || 1;
      const reach = tgt.size * 0.5 + tr.range;
      const moving = dist > reach;
      tr.mesh.rotation.y = Math.atan2(dx, dz) + (TROOP_FACE[tr.type] || 0);   // always face the target (War Jet nose to target)
      if (moving) {
        const v = tr.speed * dt; tr.x += (dx / dist) * v; tr.z += (dz / dist) * v;
        tr.mesh.position.x = tr.x; tr.mesh.position.z = tr.z;
      } else {
        tr.cd -= dt;
        if (tr.cd <= 0) { tr.cd = 0.6; this.hitBuilding(tgt, tr.dps * 0.6); this.troopAttack(tr, tgt.cx, tgt.cz); }
      }
      tr.mesh.position.y = tr.isAir ? 1.6 + Math.sin(now / 220 + tr.x) * 0.12 : (tr.flyY ? tr.flyY + Math.sin(now / 240 + tr.x) * 0.1 : 0.4);
      this.animTroop(tr, moving, now, dt);
    }

    // defenses: track/aim every tick, fire type-specific FX on cooldown
    for (const d of alive) {
      if (!d.isDefense) continue;
      const st = DSTATS[d.type] || { range: 6, rate: 1 };
      const tgt = this.nearestTroopInRange(b.troops, d.cx, d.cz, st.range, st.groundOnly);
      this.aimDefense(d, tgt, now);
      let cd = (b.defenseCd.get(d.id) || 0) - dt;
      if (cd <= 0) {
        if (tgt) { b.defenseCd.set(d.id, st.rate); this.fireDefense(d, tgt, st, dDps(d) * st.rate); }
        else b.defenseCd.set(d.id, 0);
      } else b.defenseCd.set(d.id, cd);
    }

    // ENEMY GUARD ARMY: target your nearest troop, charge, attack
    for (const en of b.enemies) {
      if (en.hp <= 0) continue;
      if (!en.target || en.target.hp <= 0) en.target = this.nearestEnemyTarget(b.troops, en.x, en.z, en.type, en.isAir);
      const tgt = en.target;
      if (!tgt) { en.mesh.position.y = en.isAir ? 1.6 : (en.flyY || 0.4); this.animTroop(en, false, now, dt); continue; }
      const dx = tgt.x - en.x, dz = tgt.z - en.z, dist = Math.hypot(dx, dz) || 1, reach = en.range + 0.7, moving = dist > reach;
      en.mesh.rotation.y = Math.atan2(dx, dz) + (TROOP_FACE[en.type] || 0);
      if (moving) { const v = en.speed * dt; en.x += (dx / dist) * v; en.z += (dz / dist) * v; en.mesh.position.x = en.x; en.mesh.position.z = en.z; }
      else { en.cd -= dt; if (en.cd <= 0) { en.cd = 0.6; const d = Math.min(en.dps * 0.6, tgt.maxHp * 0.35); tgt.hp -= d; this.spawnDamage(tgt.x, (tgt.npY || 1.7) + 0.3, tgt.z, d); this.troopAttack(en, tgt.x, tgt.z); } }
      en.mesh.position.y = en.isAir ? 1.6 + Math.sin(now / 220 + en.x) * 0.12 : (en.flyY ? en.flyY + Math.sin(now / 240 + en.x) * 0.1 : 0.4);
      this.animTroop(en, moving, now, dt);
    }
    for (const en of b.enemies) if (en.hp <= 0) { if (en.mesh.parent) this.troopLayer.remove(en.mesh); if (en.np) en.np.el.remove(); }
    b.enemies = b.enemies.filter((e: any) => e.hp > 0);

    // nameplates (name + HP bar + numbers) for every building + troop
    this.updateNameplates();

    // cull dead troops (+ their nameplates)
    for (const tr of b.troops) if (tr.hp <= 0) { if (tr.mesh.parent) this.troopLayer.remove(tr.mesh); if (tr.np) tr.np.el.remove(); }
    b.troops = b.troops.filter((t: any) => t.hp > 0);

    this.tickProjectiles(dt);

    // end conditions
    const toDeploy = Object.values(b.army).reduce((s: number, n: any) => s + Number(n || 0), 0);
    const timeLeft = b.duration - (now - b.start) / 1000;
    if (b.destroyed >= b.total || timeLeft <= 0 || (toDeploy <= 0 && b.troops.length === 0)) { this.finishBattle(); return; }
    if (now - b.lastEmit > 120) { b.lastEmit = now; this.emitBattle(timeLeft); }
  }

  nearestTroopInRange(troops: any[], x: number, z: number, range: number, groundOnly?: boolean) {
    let best = null, bd = range * range, tank = null, td = range * range;   // TANK AGGRO: Titans pull defense fire
    for (const tr of troops) {
      if (tr.hp <= 0) continue; if (groundOnly && tr.isAir) continue;
      const d = (tr.x - x) ** 2 + (tr.z - z) ** 2; if (d > range * range) continue;
      if (d < bd) { bd = d; best = tr; }
      if (tr.type === 'giant' && d < td) { td = d; tank = tr; }
    }
    return tank || best;   // a Titan in range soaks the shot so squishies behind survive
  }
  tickProjectiles(dt: number) {
    const b = this.battle; if (!b) return;
    for (const p of b.projectiles) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz) || 0.001, v = p.speed * dt;
      if (d <= v) { p.done = true; if (p.mesh.parent) this.fxLayer.remove(p.mesh); try { p.onHit && p.onHit(); } catch {} }
      else {
        p.x += (dx / d) * v; p.z += (dz / d) * v;
        let y = 1.0;
        if (p.arc) { const prog = p.total ? 1 - d / p.total : 0; y = (p.y0 ?? 1) + ((p.ty ?? 1) - (p.y0 ?? 1)) * prog + p.arc * Math.sin(prog * Math.PI); p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 7; }   // lobbed shell
        p.mesh.position.set(p.x, y, p.z);
      }
    }
    b.projectiles = b.projectiles.filter((p: any) => !p.done);
  }
  emitBattle(timeLeft?: number) {
    const b = this.battle; if (!b) return;
    const pct = b.total ? b.destroyed / b.total : 0;
    const remaining: Record<string, number> = {};
    for (const [k, n] of Object.entries(b.army)) if (Number(n) > 0) remaining[k] = Number(n);
    this.onBattleUpdate({
      pct, stars: this.starsFor(pct), onField: b.troops.length, remaining,
      deployType: this.deployType, timeLeft: Math.max(0, timeLeft ?? b.duration - (performance.now() - b.start) / 1000),
    });
  }
  finishBattle() {
    const b = this.battle; if (!b || b.ended) return; b.ended = true;
    for (const p of b.projectiles) if (p.mesh?.parent) this.fxLayer.remove(p.mesh);   // tickBattle stops now — clear any mid-air shells
    b.projectiles.length = 0;
    const pct = b.total ? b.destroyed / b.total : 0;
    this.onBattleEnd({ stars: this.starsFor(pct), destructionPct: pct, troopsUsed: { ...b.deployed } });
  }

  // ---------- frame loop ----------
  frame(tms: number) {
    const t = tms / 1000;
    const dt = Math.min(0.05, (tms - (this.lastFrame || tms)) / 1000); this.lastFrame = tms;
    for (const g of this.buildLayer.children) (g.userData.anim as Anim[] | undefined)?.forEach((fn) => fn(t));
    for (const a of this.ornAnims) a(t);
    this.updateMixers(dt);
    this.updateSky(this.skyFixed ?? t);
    if (this.battle && !this.battle.ended) this.tickBattle(tms);
    else this.updateWorkers(t, dt);
    if (this.autoOrbit) { this.cam.azim += dt * 0.16; this.updateCamera(); }   // 360° camera view: slowly orbit the base
    this.updateParticles(dt);
    this.updateBeams(dt);
    if (this.elecWallMats.length) { const f = 0.7 + Math.abs(Math.sin(tms * 0.011)) * 0.9; for (const m of this.elecWallMats) m.emissiveIntensity = f; }   // electrified walls pulse
    this.updateGhost();
    this.updateLabels();
    if (this.shake > 0.01) {
      const p = this.camPos();
      this.camera.position.set(p.x + (Math.random() - 0.5) * this.shake, p.y + (Math.random() - 0.5) * this.shake, p.z + (Math.random() - 0.5) * this.shake);
      this.shake *= 0.85; this._wasShaking = true;
    } else if (this._wasShaking) { this.updateCamera(); this._wasShaking = false; }
    this.renderer.render(this.scene, this.camera);
  }

  updateLabels() {
    if (!this.items.length) return;
    const now = Date.now() + this.timeOffset;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      const b = it.b;
      if (!it.group.visible) { it.label.style.display = 'none'; continue; }
      it.group.getWorldPosition(v); v.y += it.anchorY;
      v.project(this.camera);
      if (v.z > 1) { it.label.style.display = 'none'; continue; }
      it.label.style.display = '';
      it.label.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
      it.label.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      it.label.innerHTML = this.labelHtml(b, now);
    }
  }
  // base labels: only build/upgrade timers + the clickable collect chip (name/HP are shown on hover instead — see hover tooltip)
  labelHtml(b: any, now: number): string {
    const def = DEF[b.type];
    if (b.level < 1 || b.upgradeCompletesAt) {
      const target = b.level < 1 ? 1 : b.level + 1;
      let total = DEF[b.type]?.levels?.[String(target)]?.buildTimeSec;
      if (b.type === 'town_hall') total = TH[String(target)]?.buildTimeSec;
      const left = Math.max(0, ((b.upgradeCompletesAt || 0) - now) / 1000);
      const prog = total ? Math.max(0, Math.min(1, 1 - left / total)) : 0;
      return `<div style="color:#9bff3b">${b.level < 1 ? '🏗️' : '⬆️'} ${fmt(left)}</div>
        <div style="width:46px;height:5px;background:#0008;border-radius:3px;margin:1px auto 0;overflow:hidden"><div style="width:${prog * 100}%;height:100%;background:#18e0ff"></div></div>`;
    }
    if (def.produces) {
      // tick the stored amount LIVE between 5s polls (+1 every 5s at L1) so it visibly counts up
      const lv = def.levels?.[String(b.level)];
      const cap = lv?.capacity || 0;
      const ratePerSec = (lv?.ratePerHour || 0) / 3600;
      const elapsed = Math.max(0, (now - (this.pollTime || now)) / 1000);
      const live = cap ? Math.min(cap, (b.storedAmount || 0) + ratePerSec * elapsed) : (b.storedAmount || 0) + ratePerSec * elapsed;
      const shown = Math.floor(live);
      if (shown < 1) return '';   // nothing banked yet
      const full = cap > 0 && live >= cap;
      const gold = def.produces === 'gold';
      const col = gold ? '#ffc24a' : '#c06bff';
      const coin = gold ? '<i class="ic-gold"></i>' : '<i class="ic-plasma"></i>';
      const txt = full ? `${coin} ${gold ? 'FULL GOLD' : 'FULL PLASMA'}` : `${coin} ${shown}`;
      return `<span class="collect-lbl${full ? ' full' : ''}" data-id="${b.id}" style="pointer-events:auto;cursor:pointer;color:${full ? '#fff' : col};background:${full ? (gold ? '#caa12e' : '#8a4dd6') : '#000a'};padding:2px 8px;border-radius:11px;font-weight:800;box-shadow:0 0 8px ${col}88">${txt}</span>`;
    }
    if (b.type === 'town_hall') {                       // the Command Core wears the base/commander name
      const name = (this.state as any)?.player?.displayName;
      if (name) return `<div class="core-name">🛡️ ${String(name).replace(/[<>&"]/g, '')}</div>`;
    }
    return '';
  }
}

function fmt(s: number) {
  s = Math.ceil(s);
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h) return `${h}h ${m}m`; if (m) return `${m}m ${ss}s`; return `${ss}s`;
}
