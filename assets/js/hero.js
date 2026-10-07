// The opening: the reference painter's Starry Night replayed as the page scrolls. The arm follows the recorded joint
// positions (10 Hz samples of the replay), its brush takes the colour of the paint it has dipped, and the sheet shows the
// brush engine's own picture at that moment (hero.mp4: frames taken each time the painted path has grown by 1/480 of its
// length; phones and tablets get every second frame as stills instead). Scrolling runs through the painting at an even
// pace: travel and dips are played faster than the brushwork.
import * as THREE from 'three';
import { createStage } from './stage.js';
import { loadPanda, createPanda } from './robot.js';

const DATA = new URL('../media/hero/', import.meta.url);
const PAINT = [0.05, 0.86];             // the scroll window of the painting
// caption windows on scroll progress: fade in over [a, b], out over [c, d]
const WINDOWS = { kicker: [null, null, 0.025, 0.06], cue: [null, null, 0.02, 0.05], l1: [0.03, 0.06, 0.13, 0.16], l2: [0.17, 0.2, 0.3, 0.33],
  l3: [0.35, 0.38, 0.58, 0.61], l4: [0.63, 0.66, 0.82, 0.85], title: [0.88, 0.93, 9, 9] };
const TRAVEL = 0.1;                      // how much scroll a second of travel gets, against a second of painting
const PAPER = '#f8f4ec';                 // the brush engine's paper, as the sheet is before the first stroke
// camera keyframes on scroll progress (three.js frame: the simulator's x, z up, -y; the robot's base at x -0.615 faces +x,
// the main sheet's centre is at (-0.1, 0.02, 0), the paints at -z): eye, look, the field of view, and how far the picture
// slides right. A long lens from high on the robot's right keeps the elbow at the edge of the frame while the arm paints
const CAMERA = [
  { t: 0.0, eye: [-0.465, 1.015, 0.51], look: [-0.08, 0.02, -0.04], fov: 21, shift: 0.16 },
  { t: 0.3, eye: [-0.471, 1.031, 0.539], look: [-0.08, 0.02, -0.02], fov: 21, shift: 0.16 },
  { t: 0.62, eye: [-0.666, 1.127, 0.651], look: [-0.12, 0.04, 0.0], fov: 25, shift: 0.15 },
  { t: 0.86, eye: [-1.0, 1.35, 1.35], look: [-0.25, 0.12, 0.0], fov: 30, shift: 0.13 },
  { t: 1.0, eye: [-1.2, 1.45, 1.8], look: [-0.27, 0.14, -0.02], fov: 30, shift: 0.24 },
];
const CAM_OVERRIDE = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export async function initHero({ section, canvas, frozen = null }) {
  const [meta, motion, panda] = await Promise.all([fetch(new URL('hero.json', DATA)).then((r) => r.json()),
    fetch(new URL('motion.bin', DATA)).then((r) => r.arrayBuffer()), loadPanda()]);
  const n = meta.samples, sc = meta.scene;
  const qi = new Int16Array(motion, 0, n * 7), flags = new Uint8Array(motion, n * 14, n);
  // the even pace: painting samples weigh 1, the rest TRAVEL
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + ((flags[i] & 1) ? 1 : TRAVEL);
  for (let i = 0; i < n; i++) cum[i] /= cum[n - 1];
  const firstPaint = flags.findIndex((f) => f & 1);     // the sample where the first stroke starts
  const sampleAt = (m) => {             // fractional sample index at painting progress m
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= m) lo = mid; else hi = mid; }
    const span = cum[hi] - cum[lo];
    return lo + (span > 0 ? (m - cum[lo]) / span : 0);
  };

  const stage = createStage(canvas, { span: 0.9, cell: 0.05, every: 5 });
  const { scene, camera, root, renderer } = stage;
  const world = new THREE.Group();                 // the simulator's frame: +z up
  world.rotation.x = -Math.PI / 2;
  root.add(world);

  // the drawing board, the sheets, the paint plate and its paints
  const box = (half, color, rough = 0.85) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.castShadow = true; m.receiveShadow = true; return m;
  };
  const board = box(sc.board.half, '#d6d5d1');
  const plateCols = { light: ['#d6d5d1', '#ebeae6'], dark: ['#8a8984', '#a3a29d'] };   // the board and plate dim at night
  board.position.set(...sc.board.center);
  world.add(board);
  // the sheet's frames: a video on desktops; stills on phones and tablets, whose browsers (iOS WebKit, Android when saving
  // data) decode a never-played video lazily or not at all. ?frames=video|stills picks one
  const knob = new URLSearchParams(location.search).get('frames');
  let useStills = Boolean(meta.stills) && (knob === 'stills' || (knob !== 'video' && matchMedia('(pointer: coarse)').matches));
  const stillTex = new THREE.Texture();
  Object.assign(stillTex, { colorSpace: THREE.SRGBColorSpace, minFilter: THREE.LinearFilter, generateMipmaps: false });
  let video = null, tex = null;
  if (!useStills) {
    video = document.createElement('video');
    Object.assign(video, { muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    video.className = 'hero-frames';               // in the page (hidden): a detached video may never load
    section.querySelector('.hero-sticky').appendChild(video);
    // the whole file first: a blob seeks on any server (python's http.server does not answer range requests)
    fetch(new URL('hero.mp4', DATA)).then((r) => r.blob()).then((b) => {
      video.src = URL.createObjectURL(b);
      setTimeout(() => { if (have < 0) toStills(); }, 8000);     // no frame by then: this browser will not decode it
    }).catch(() => toStills());
    tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  let blank = null, sheetMat = null;
  for (const s of sc.sheets) {
    const main = s.name === 'main';
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]),
      main ? (sheetMat = new THREE.MeshBasicMaterial({ map: useStills ? stillTex : tex, toneMapped: false })) : new THREE.MeshStandardMaterial({ color: '#f6f2ea', roughness: 0.95 }));
    // image columns run along -y, rows along -x (row 0 = the far edge): the plane turned -90 degrees about z
    plane.rotation.z = -Math.PI / 2;
    plane.position.set(s.center[0], s.center[1], s.z + 0.0002);
    plane.receiveShadow = !main;
    world.add(plane);
    if (main) {
      // the bare paper until the first frame (and while the video loads): the frames start after the first bit of paint
      blank = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), new THREE.MeshBasicMaterial({ color: PAPER, toneMapped: false }));
      blank.rotation.z = -Math.PI / 2; blank.position.set(s.center[0], s.center[1], s.z + 0.0003);
      world.add(blank);
      // the arm's shadow on the painting
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), new THREE.ShadowMaterial({ opacity: 0.22 }));
      shade.rotation.z = -Math.PI / 2; shade.position.set(s.center[0], s.center[1], s.z + 0.0004); shade.receiveShadow = true;
      world.add(shade);
    }
  }
  const p = sc.plate, ph = (p.top - 0.02) / 2;
  const plate = box([p.half[0], p.half[1], ph], '#ebeae6', 0.35);
  plate.position.set(p.center[0], p.center[1], 0.02 + ph);
  world.add(plate);
  for (const w of sc.wells) {
    const h = p.surface - p.top;
    const puddle = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, h, 32), new THREE.MeshStandardMaterial({ color: w.hex, roughness: 0.35 }));
    puddle.rotation.x = Math.PI / 2; puddle.position.set(w.center[0], w.center[1], p.top + h / 2); puddle.receiveShadow = true;
    world.add(puddle);
  }
  const night = () => {
    const [b, pl] = plateCols[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
    board.material.color.set(b); plate.material.color.set(pl);
  };
  night();
  addEventListener('themechange', night);
  const robot = createPanda(panda, { base: sc.robot_base, tuft: sc.tuft });
  world.add(robot.group);

  // the frames: the video seeks to the frame for the moment shown, one seek at a time; the stills load around it
  const frames = meta.frames;
  let want = 0, have = -1, seeking = false, ready = false;
  const frameAt = (sample) => {
    let lo = 0, hi = frames.count - 1;
    if (sample < frames.sample[0]) return 0;
    while (hi > lo) { const mid = (lo + hi + 1) >> 1; if (frames.sample[mid] <= sample) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const seek = () => {
    if (useStills || !ready || seeking || want === have) return;
    seeking = true;
    const k = want;
    video.currentTime = (k + 0.5) / frames.fps;
    video.addEventListener('seeked', () => { seeking = false; have = k; tex.needsUpdate = true; seek(); dirty = true; }, { once: true });
  };
  // seek once the metadata is in: a browser that loads no data before a seek or a play never reaches loadeddata
  const onReady = () => { if (!ready && video.readyState >= 1) { ready = true; seek(); } };
  if (video) {
    for (const e of ['loadedmetadata', 'loadeddata', 'canplay']) video.addEventListener(e, onReady);
    video.addEventListener('error', () => toStills());
    onReady();
  }
  const list = meta.stills?.frames ?? [], cache = new Map(), loading = new Set();
  let shownStill = -1;
  const stillAt = (k) => {                       // the last still at or before frame k
    let lo = 0, hi = list.length - 1;
    while (hi > lo) { const mid = (lo + hi + 1) >> 1; if (list[mid] <= k) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const loadStill = (j) => {
    if (j < 0 || j >= list.length || cache.has(j) || loading.has(j)) return;
    loading.add(j);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { loading.delete(j); cache.set(j, img); dirty = true; pump(); };
    img.onerror = () => { loading.delete(j); };
    img.src = new URL(`stills/f${String(list[j]).padStart(4, '0')}.webp`, DATA).href;
  };
  // the still for the moment shown first, then the ones after it (scrolling paints forward), three at a time; only a
  // window around it stays in memory
  const pump = () => {
    if (!useStills) return;
    const j = stillAt(want);
    for (let d = 0; d < 12 && loading.size < 3; d++) loadStill(j + d);
    if (loading.size < 3) loadStill(j - 1);
    for (const k of cache.keys()) if (Math.abs(k - j) > 24 && k !== shownStill) cache.delete(k);
  };
  const showStill = () => {
    const j = stillAt(want);
    let best = -1;
    for (let k = j; k >= 0; k--) if (cache.has(k)) { best = k; break; }
    if (best >= 0 && best !== shownStill) { stillTex.image = cache.get(best); stillTex.needsUpdate = true; shownStill = best; }
  };
  const toStills = () => {
    if (useStills || !list.length) return;
    useStills = true;
    sheetMat.map = stillTex; sheetMat.needsUpdate = true;
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    pump(); dirty = true;
  };

  const hud = { stroke: document.getElementById('hud-stroke'), bar: document.getElementById('hud-bar'), paint: document.getElementById('hud-paint') };
  const copy = [...section.querySelectorAll('[data-hero]')].map((el) => ({ el, w: WINDOWS[el.dataset.hero], title: el.dataset.hero === 'title' }));
  const q = new Float64Array(7), look = new THREE.Vector3(), eye = new THREE.Vector3();
  let shown = frozen ?? 0, visible = true, running = false, dirty = true;

  function progress() {
    if (frozen != null) return frozen;
    const r = section.getBoundingClientRect(), total = section.offsetHeight - innerHeight;
    return total > 0 ? clamp(-r.top / total) : 0;
  }

  function draw() {
    const pr = progress();
    const before = shown;
    shown = frozen != null ? pr : shown + (pr - shown) * 0.14;      // ease toward the scroll position: no jumps
    if (Math.abs(shown - before) < 1e-5 && !dirty) return;
    dirty = false;
    const m = clamp((shown - PAINT[0]) / (PAINT[1] - PAINT[0]));
    const s = sampleAt(m), i = Math.min(n - 2, Math.floor(s)), t = s - i;
    for (let k = 0; k < 7; k++) q[k] = meta.q_mid[k] + lerp(qi[i * 7 + k], qi[(i + 1) * 7 + k], t) * meta.q_step;
    robot.setJoints(q);
    const paint = (flags[i] >> 1) - 1;
    robot.setPaint(paint >= 0 ? meta.paints[paint] : null);
    want = frameAt(s);
    if (useStills) { pump(); showStill(); } else seek();
    const bare = s < frames.sample[0];
    blank.visible = bare || (useStills ? shownStill < 0 : have < 0);

    // the camera: from high on the robot's right, looking down on the painting at first (the sheet near upright, as the
    // robot sees it), then back and wider until the whole arm shows; at the end the title takes the left
    const k = CAMERA.findIndex((c) => c.t > shown);
    const a = CAMERA[Math.max(0, (k < 0 ? CAMERA.length : k) - 1)], b = CAMERA[k < 0 ? CAMERA.length - 1 : k];
    const f = a === b ? 1 : smooth(a.t, b.t, shown);
    const reveal = smooth(0.86, 1.0, shown);
    const portrait = Math.min(2.2, Math.max(1, 1.25 / camera.aspect)) * (camera.aspect < 0.8 ? 1 + 0.35 * reveal : 1);
    look.set(lerp(a.look[0], b.look[0], f), lerp(a.look[1], b.look[1], f), lerp(a.look[2], b.look[2], f));
    eye.set(lerp(a.eye[0], b.eye[0], f), lerp(a.eye[1], b.eye[1], f), lerp(a.eye[2], b.eye[2], f));
    eye.sub(look).multiplyScalar(portrait).add(look);
    camera.fov = lerp(a.fov, b.fov, f);
    if (CAM_OVERRIDE) { eye.set(...CAM_OVERRIDE.slice(0, 3)); look.set(...CAM_OVERRIDE.slice(3, 6)); camera.fov = CAM_OVERRIDE[6] ?? camera.fov; }
    camera.position.copy(eye); camera.lookAt(look);
    const w = canvas.clientWidth, h = canvas.clientHeight, wide = camera.aspect > 1.2;
    const shift = wide ? w * lerp(lerp(a.shift, b.shift, f), 0.24, reveal) : 0;
    // portrait: the captions sit at the bottom, so the picture rides a little high; at the end the title takes the top
    const drop = wide ? 0 : h * lerp(-0.1, 0.3, reveal);
    if (shift > 0.5 || Math.abs(drop) > 0.5) camera.setViewOffset(w, h, -shift, -drop, w, h); else camera.clearViewOffset();

    for (const c of copy) {
      const a = (c.w[0] == null ? 1 : smooth(c.w[0], c.w[1], shown)) * (1 - smooth(c.w[2], c.w[3], shown));
      c.el.style.opacity = a.toFixed(3);
      c.el.style.transform = `translateY(${((1 - a) * (c.title ? 10 : 16)).toFixed(1)}px)`;
      c.el.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
    }
    const stroke = frames.stroke[Math.min(frames.count - 1, want)] ?? 0;
    hud.stroke.textContent = m <= 0 || (bare && s < firstPaint) ? '0' : bare ? '1' : String(Math.min(meta.strokes, stroke));
    hud.bar.style.width = `${(m * 100).toFixed(1)}%`;
    hud.paint.style.background = paint >= 0 ? meta.paints[paint] : 'transparent';
    renderer.render(scene, camera);
  }
  function loop() {
    if (!visible) { running = false; return; }
    draw();
    requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(section);
  addEventListener('resize', () => { stage.resize(); dirty = true; if (!running) draw(); });
  addEventListener('themechange', () => { dirty = true; if (!running) draw(); });
  stage.resize();
  draw();
  start();
  // the theme changes the page behind the sheet; the sheet stays the paint's own colour
  return { redraw: () => { dirty = true; draw(); } };
}
