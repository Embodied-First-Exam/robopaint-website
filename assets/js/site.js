// RoboPaint's page: the collection, the viewer, the hand, the judging, the two modes, the results, the agents' copies; the
// opening's robot is in hero.js. Data: assets/data/works.json (scripts/export_works.py), results.json (export_results.py),
// attempts.json (export_attempts.py), figures.json (make_figures.py); media under assets/media/. Preview knobs:
//   ?theme=dark            night
//   ?hero=0.6              freeze the opening at that scroll fraction (screenshots)
//   ?overview=1            a short, static opening
//   ?focus=works           open the page at a section
//   ?work=oil_starrynight  open a work in the viewer (&view=time for its timelapse; &copy=<run>:<open|closed> for an
//                          agent's copy, e.g. &copy=codex-gpt6_luna-xhigh:closed)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');
if (params.get('overview') === '1') document.documentElement.classList.add('overview');

const FAMILIES = {
  kaishu: { name: 'Kaishu', zh: '楷書', what: 'regular script', tool: 'Chinese brush',
    note: '<b><span class="zh">楷書</span> Kaishu, regular script.</b> Single characters and four-character works with a soft Chinese brush whose hairs bend, drag and spring back. A character may take no more strokes than it has.' },
  xingshu: { name: 'Xingshu', zh: '行書', what: 'running script', tool: 'Chinese brush',
    note: '<b><span class="zh">行書</span> Xingshu, running script.</b> Characters and phrases from Wang Xizhi\'s <span class="zh">蘭亭序</span>. The strokes run into one another, so the brush may leave the paper only a few times.' },
  lettering: { name: 'Lettering', what: 'Western lettering', tool: 'dip pen',
    note: '<b>Lettering.</b> Words in five hands: a broad-edge nib held at a steady angle for foundational, italic, uncial and textura; a pointed pen that swells under pressure for copperplate.' },
  acrylic: { name: 'Acrylic', what: 'stroke copy', tool: 'round brush',
    note: '<b>Acrylic.</b> Copy a small painting stroke for stroke: about 300 opaque strokes in ten paints and four brush sizes, after Hokusai, Hiroshige, van Gogh, Cézanne, Marc and Gauguin.' },
  oil: { name: 'Oil', what: 'painting from a reference', tool: 'oil brush',
    note: '<b>Oil.</b> Paint a masterpiece from a photograph with wet paint that smudges and blends: sixteen premixed paints, and at most half as many strokes again as the reference painter used.' },
};
const ORDER = ['kaishu', 'xingshu', 'lettering', 'acrylic', 'oil'];
// the first view of the collection: a few of each discipline (all of them behind "Show all")
const FEATURED = ['oil_starrynight', 'kaishu_yongzibafa', 'acrylic_greatwave', 'lettering_omnium', 'oil_pearlearring', 'xingshu_maolinxiuzhu',
  'kaishu_yong', 'acrylic_sunflowers', 'oil_wanderer', 'xingshu_zhi', 'lettering_minimum', 'acrylic_redfuji', 'oil_monalisa', 'kaishu_long',
  'acrylic_plumpark', 'oil_temeraire'];

/* ---------- day / night ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('robopaint-theme', t); } catch (e) { /* private mode */ }
  $('meta[name="theme-color"]').content = t === 'dark' ? '#121417' : '#f4f6f9';
  dispatchEvent(new Event('themechange'));
}
$('#theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('meta[name="theme-color"]').content = document.documentElement.dataset.theme === 'dark' ? '#121417' : '#f4f6f9';

/* ---------- navigation ---------- */
function setupNav() {
  const nav = $('.nav'), menu = $('#menu-toggle');
  const open = (on) => { nav.classList.toggle('open', on); menu.setAttribute('aria-expanded', String(on)); };
  menu.addEventListener('click', () => open(!nav.classList.contains('open')));
  $$('.nav-links a', nav).forEach((a) => a.addEventListener('click', () => open(false)));
  const links = $$('.nav-links a');
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['works', 'hand', 'judging', 'modes', 'results', 'attempts'].forEach((id) => io.observe(document.getElementById(id)));
  addEventListener('scroll', () => { if (scrollY < innerHeight * 0.5) links.forEach((a) => a.classList.remove('active')); }, { passive: true });
}
const revealer = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }),
  { rootMargin: '0px 0px -6% 0px' });
const reveal = (root = document) => $$('.reveal:not(.in)', root).forEach((el) => revealer.observe(el));

/* ---------- a work's words ---------- */
function titleHTML(w) {
  if (w.family === 'kaishu' || w.family === 'xingshu') return `<span class="zh">${esc(w.chars)}</span>`;
  if (w.family === 'lettering') return esc(w.title);
  return esc(w.original || w.title);
}
function byline(w) {
  if (w.family === 'kaishu' || w.family === 'xingshu') return `${esc(w.reading)}, ${esc(w.gloss)}`;
  if (w.family === 'lettering') return `${esc(w.hand_name)}, ${w.pen === 'pointed_pen' ? 'pointed pen' : 'broad-edge nib'}`;
  return `after ${esc(w.artist)}, ${esc(w.date)}`;
}
function facts(w) {
  const f = [];
  if (w.family === 'kaishu' || w.family === 'xingshu' || w.family === 'lettering') f.push(`${w.budget} stroke${w.budget > 1 ? 's' : ''}`);
  else f.push(`≤ ${w.budget} strokes`, `<span class="swatches">${w.palette.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`);
  return f.join('');
}
// the practice grid under a character (米字格; four cells for a four-character work)
function practiceGrid(w) {
  if (w.family !== 'kaishu' && w.family !== 'xingshu') return '';
  const cells = w.characters === 4 ? [[0, 0], [50, 0], [0, 50], [50, 50]] : [[8, 8, 84]];
  const c = 'var(--seal)';
  const g = cells.map(([x, y, s = 50]) => `<rect x="${x + 2}" y="${y + 2}" width="${s - 4}" height="${s - 4}" />
    <path d="M${x + s / 2} ${y + 2}V${y + s - 2}M${x + 2} ${y + s / 2}H${x + s - 2}M${x + 2} ${y + 2}L${x + s - 2} ${y + s - 2}M${x + s - 2} ${y + 2}L${x + 2} ${y + s - 2}" stroke-dasharray="1.4 1.4"/>`).join('');
  return `<svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none" stroke="${c}" stroke-width=".35" style="color:${c}">${g}</svg>`;
}

/* ---------- the statement ---------- */
function renderNumbers(works) {
  const maxBudget = Math.max(...works.map((w) => w.budget));
  const items = [[works.length, 'works to copy'], [ORDER.length, 'disciplines, each with its own brush'], [`2–${maxBudget}`, 'strokes in a work'], [2, 'modes: open and closed book']];
  $('#bignums').innerHTML = items.map(([n, t]) => `<div><dt>${n}</dt><dd>${t}</dd></div>`).join('');
}

/* ---------- the collection ---------- */
let WORKS = [], shown = [], family = 'all', expanded = false;
function renderChips() {
  const count = (f) => WORKS.filter((w) => w.family === f).length;
  $('#disc-chips').innerHTML = [`<button class="chip on" data-f="all">All <i>${WORKS.length}</i></button>`,
    ...ORDER.map((f) => `<button class="chip" data-f="${f}">${FAMILIES[f].zh ? `<span class="zh">${FAMILIES[f].zh}</span> ` : ''}${FAMILIES[f].name} <i>${count(f)}</i></button>`)].join('');
  $('#disc-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    family = b.dataset.f; expanded = false;
    $$('#disc-chips .chip').forEach((c) => c.classList.toggle('on', c === b));
    renderWorks();
  });
}
function workCard(w) {
  return `<button class="work reveal" data-id="${w.id}" type="button" aria-label="${esc(w.title)}">
    <div class="mat"><div class="pic">
      <img src="${w.media.target.replace('target.webp', 'target_s.webp')}" alt="" loading="lazy" decoding="async">
      <img class="robot" src="${w.media.painted.replace('painted.webp', 'painted_s.webp')}" alt="" loading="lazy" decoding="async">
      ${practiceGrid(w)}
    </div><span class="flip">the reference robot's copy</span></div>
    <div class="placard"><p class="t">${titleHTML(w)}</p><p class="by">${byline(w)}</p><p class="facts">${facts(w)}</p></div>
  </button>`;
}
function renderWorks() {
  const all = family === 'all' ? WORKS : WORKS.filter((w) => w.family === family);
  if (family === 'all' && !expanded) shown = FEATURED.map((id) => WORKS.find((w) => w.id === id)).filter(Boolean);
  else shown = family === 'all' ? [...all].sort((a, b) => ORDER.indexOf(a.family) - ORDER.indexOf(b.family)) : all;
  $('#works-grid').innerHTML = shown.map(workCard).join('');
  $('#disc-note').innerHTML = family === 'all' ? 'Calligraphy, lettering and painting, from a two-stroke character to a 683-stroke van Gogh.' : FAMILIES[family].note;
  const more = $('#works-more');
  more.hidden = !(family === 'all' && !expanded);
  more.innerHTML = `Show all ${WORKS.length} <span class="arr">↓</span>`;
  reveal($('#works-grid'));
}

/* ---------- whose copy: the reference robot's, or an agent's from the batch evaluation ---------- */
let RESULTS = { runs: [] }, COPIES = {};
const MODES = [['open', 'Open book', 'var(--priv)'], ['closed', 'Closed book', 'var(--std)']];
const shortModel = (m) => m.replace('GPT-6 ', '');
const isPaint = (w) => w.family === 'acrylic' || w.family === 'oil';
function copyOf(w, copy) {
  if (!copy || copy === 'ref') return { ref: true, src: w.media.painted, thumb: w.media.painted.replace('painted.webp', 'painted_s.webp'), label: 'The reference robot', tag: 'Robot', ok: true };
  const [runId, mode] = copy.split(':');
  const run = RESULTS.runs.find((r) => r.id === runId), r = run?.tasks[w.id]?.[mode];
  if (!r || !COPIES[runId]?.[w.id]?.includes(mode)) return null;
  const src = `assets/media/attempts/${runId}/${w.id}_${mode}.webp`;
  return { run, mode, r, src, thumb: src, label: `${run.model} · ${mode} book`, tag: `${shortModel(run.model)} · ${mode} book`, ok: r.ok === 1,
    why: [r.image_success === 0 && 'picture', r.strict_ok === 0 && 'hand'].filter(Boolean).join(' · ') || 'failed' };
}
function agentScoreHTML(w, c) {
  const r = c.r, ref = w.reference || {};
  const pic = isPaint(w)
    ? `score ${r.image_final_reward?.toFixed(2)}, the reference robot's ${ref.final_reward?.toFixed(2)}; lightness SSIM ${r.ssim_L?.toFixed(2)}, needs ≥ ${w.rule.ssim_L}`
    : `ink overlap IoU ${(r.iou ?? r.image_final_reward)?.toFixed(2)}, needs ≥ ${w.rule.iou}`;
  return `${c.ok ? '<span class="stamp">pass</span>' : '<span class="stamp no">✕</span>'}<span><b>${esc(c.run.model)}</b>, ${c.mode} book: ${c.ok ? 'solved' : 'not solved'}.
    The picture ${r.image_success ? 'passes' : 'fails'} (${pic}). The hand ${r.strict_ok ? 'passes' : 'fails'} (a path of ${fmt(Math.round(r.path_mm))} mm).
    ${Math.max(1, Math.round((r.wall_s || 0) / 60))} min of work.</span>`;
}

/* ---------- the viewer: compare the exemplar with a copy; watch the reference copy being made ---------- */
const viewer = { w: null, mode: 'compare', cut: 50, video: null, tl: null, copy: 'ref', list: null, from: 'works' };
function ruleHTML(w) {
  const r = w.rule;
  if (w.family === 'acrylic' || w.family === 'oil') {
    return `The picture: mean colour difference <b>ΔE ≤ ${r.de_mean}</b> (90% of the sheet ≤ ${r.de_p90}), lightness structure <b>SSIM ≥ ${r.ssim_L}</b>,
      edges ≥ ${r.edge_corr}, paint on ≥ ${Math.round(r.paint_iou * 100)}% of the sheet. The hand: at most <b>${r.max_strokes} strokes</b>, a path of at most
      ${fmt(r.max_path_mm / 1000)} m, and sweeps rather than scribbles (zigzag or serpentine strokes ≤ ${Math.round(r.max_scribble_share * 100)}% of the path).`;
  }
  return `The picture: ink overlap <b>IoU ≥ ${r.iou}</b>, outlines within 1 mm ≥ ${r.boundary_f}, every part of the exemplar ≥ ${Math.round(r.min_stroke_coverage * 100)}% inked,
    stray ink ≤ ${Math.round(r.max_stray_frac * 100)}%. The hand: at most <b>${r.max_strokes} stroke${r.max_strokes > 1 ? 's' : ''}</b>; a path over ${fmt(Math.round(r.max_path_mm))} mm made with
    marks finer than ${r.min_mark_width_mm} mm counts as colouring in.`;
}
function exemplar(w) {
  if (w.family === 'acrylic') return `painted by the reference robot, after ${esc(w.artist)}'s <i>${esc(w.original)}</i> (${esc(w.date)})`;
  if (w.family === 'oil') return `${esc(w.artist)}, <i>${esc(w.original)}</i>, ${esc(w.date)}: a photograph (public domain, Wikimedia Commons), cropped square`;
  if (w.family === 'lettering') return 'written for RoboPaint (CC0)';
  return esc(w.source);
}
function refHTML(w) {
  const r = w.reference || {};
  const score = (w.family === 'acrylic' || w.family === 'oil') ? `mean ΔE ${r.de_mean?.toFixed(1)}, SSIM ${r.ssim_L?.toFixed(2)}` : `IoU ${r.iou?.toFixed(2)}`;
  return `<span class="stamp">pass</span><span>The reference robot: ${score}, ${fmt(r.n_strokes)} strokes, a path of ${fmt(Math.round(r.path_mm))} mm, replayed in a fresh simulator.</span>`;
}
function openViewer(id, mode = 'compare', copy = 'ref', list = null, from = 'works') {
  const w = WORKS.find((x) => x.id === id);
  if (!w) return;
  viewer.w = w;
  viewer.copy = copyOf(w, copy) ? copy : 'ref';
  viewer.list = list; viewer.from = from;
  if (viewer.copy !== 'ref' && mode === 'time') mode = 'compare';
  const fam = FAMILIES[w.family];
  $('#viewer-side').innerHTML = `
    <p class="vfam">${fam.zh ? `<span class="zh">${fam.zh}</span> · ` : ''}${fam.name} · ${fam.what}</p>
    <h3>${titleHTML(w)}</h3>
    <p class="by">${byline(w)}</p>
    <dl class="spec">
      <dt>Tool</dt><dd>${fam.tool}${w.brush_sizes_mm ? `, tips of ${w.brush_sizes_mm.join(', ')} mm` : ''}</dd>
      <dt>Strokes</dt><dd>${w.family === 'acrylic' || w.family === 'oil' ? `at most <b>${w.budget}</b> (the reference painter: ${w.strokes})` : `<b>${w.budget}</b>`}</dd>
      <dt>${w.palette.length > 1 ? 'Paints' : 'Ink'}</dt><dd><div class="palette" id="vw-palette">${w.palette.map((c, i) => `<i data-k="${i}" style="background:${c}" title="${c}"></i>`).join('')}</div></dd>
      <dt>Exemplar</dt><dd>${exemplar(w)}</dd>
    </dl>
    <p class="rule">${ruleHTML(w)}</p>
    <p class="ref-score" id="vw-score"></p>
    <div class="seg" id="vw-nav"><button data-d="-1">← Previous</button><button data-d="1">Next →</button></div>`;
  $('#vw-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const list = viewer.list || (shown.length ? shown : WORKS), i = list.findIndex((x) => x.id === viewer.w.id);
    openViewer(list[(i + Number(b.dataset.d) + list.length) % list.length].id, viewer.mode, viewer.copy, viewer.list, viewer.from);
  });
  setMode(mode);
  const v = $('#viewer');
  v.hidden = false;
  requestAnimationFrame(() => v.classList.add('show'));
  document.body.classList.add('modal-open');
}
function setMode(mode) {
  const w = viewer.w, c = copyOf(w, viewer.copy);
  viewer.mode = mode;
  if (viewer.video) { viewer.video.pause(); viewer.video = null; }
  // the reference robot's copy can be watched being made; an agent's copy is its replay's last frame
  const tools = `<div class="vs-tools seg" id="vw-tools">${[['compare', 'Compare'], ['target', 'Exemplar'], ['copy', 'Copy'], ...(c.ref ? [['time', 'Watch it made']] : [])]
    .map(([k, t]) => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const copies = [['ref', copyOf(w, 'ref')], ...RESULTS.runs.flatMap((run) => MODES.map(([m]) => [`${run.id}:${m}`, copyOf(w, `${run.id}:${m}`)]))].filter(([, x]) => x);
  const strip = copies.length > 1 ? `<div class="vs-copies" id="vw-copies" role="group" aria-label="Whose copy">${copies.map(([k, x]) =>
    `<button data-copy="${k}" class="${k === viewer.copy ? 'on' : ''}" title="${esc(x.label)}${x.ok ? ': solved' : ''}"><img src="${x.thumb}" alt="">${x.ref ? 'Reference' : esc(x.tag.replace(' book', ''))}${x.ok ? '<i class="ok"></i>' : ''}</button>`).join('')}</div>` : '';
  let frame;
  if (mode === 'time') {
    frame = `<div class="vs-frame"><video id="vw-video" muted playsinline preload="auto"></video>
      <div class="vs-scrub"><button id="vw-play" aria-label="Play or pause">❚❚</button><input id="vw-range" type="range" min="0" max="1000" value="0" aria-label="Time">
      <span id="vw-stroke">stroke 0</span></div></div>`;
  } else if (mode === 'compare') {
    frame = `<div class="vs-frame" id="vw-frame" style="--cut:${viewer.cut}%"><img src="${w.media.target}" alt="The exemplar"><img class="over" src="${c.src}" alt="${esc(c.label)}'s copy">
      <span class="vs-tag l">Exemplar</span><span class="vs-tag r">${esc(c.tag)}</span><div class="vs-handle" id="vw-handle" role="slider" aria-label="Compare" tabindex="0"></div></div>`;
  } else {
    frame = `<div class="vs-frame"><img src="${mode === 'target' ? w.media.target : c.src}" alt=""><span class="vs-tag l">${mode === 'target' ? 'Exemplar' : esc(c.label)}</span></div>`;
  }
  $('#viewer-stage').innerHTML = frame + tools + strip;
  $('#viewer-stage').classList.toggle('has-copies', Boolean(strip));
  $('#vw-tools').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); });
  $('#vw-copies')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    viewer.copy = b.dataset.copy;
    setMode(viewer.copy !== 'ref' && viewer.mode === 'time' ? 'compare' : viewer.mode);
  });
  $('#vw-score').innerHTML = c.ref ? refHTML(w) : agentScoreHTML(w, c);
  history.replaceState(null, '', `?work=${w.id}${viewer.copy !== 'ref' ? `&copy=${viewer.copy}` : ''}${mode === 'time' ? '&view=time' : ''}#${viewer.from}`);
  if (mode === 'compare') setupSlider();
  if (mode === 'time') setupTimelapse();
  $$('#vw-palette i').forEach((i) => i.classList.remove('on'));
}
function setupSlider() {
  const frame = $('#vw-frame'), h = $('#vw-handle');
  const move = (x) => { const r = frame.getBoundingClientRect(); viewer.cut = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)); frame.style.setProperty('--cut', `${viewer.cut}%`); };
  let drag = false;
  frame.addEventListener('pointerdown', (e) => { drag = true; frame.setPointerCapture(e.pointerId); move(e.clientX); });
  frame.addEventListener('pointermove', (e) => { if (drag) move(e.clientX); });
  frame.addEventListener('pointerup', () => { drag = false; });
  h.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); viewer.cut = Math.max(0, Math.min(100, viewer.cut + (e.key === 'ArrowLeft' ? -5 : 5))); frame.style.setProperty('--cut', `${viewer.cut}%`); } });
}
async function setupTimelapse() {
  const v = $('#vw-video'), range = $('#vw-range'), play = $('#vw-play'), label = $('#vw-stroke');
  viewer.video = v;
  const base = viewer.w.media.target.replace('target.webp', '');
  // the whole video first: a blob seeks on any server (python's http.server does not answer range requests)
  const [tl, blob] = await Promise.all([fetch(base + 'timelapse.json').then((r) => r.json()), fetch(base + 'timelapse.mp4').then((r) => r.blob())]);
  if (viewer.video !== v) return;                  // the viewer moved on meanwhile
  v.src = URL.createObjectURL(blob);
  const dots = $$('#vw-palette i');
  const update = () => {
    const k = Math.min(tl.frames - 1, Math.floor(v.currentTime * tl.fps));
    label.textContent = `stroke ${tl.stroke[k]} / ${tl.strokes}`;
    if (!v.seeking && v.duration) range.value = String(Math.round((v.currentTime / v.duration) * 1000));
    const p = tl.paint[k];
    dots.forEach((d, i) => d.classList.toggle('on', i === p && tl.paints.length > 1));
  };
  v.addEventListener('timeupdate', update);
  v.addEventListener('seeked', update);
  v.addEventListener('ended', () => { play.textContent = '▶'; });
  range.addEventListener('input', () => { if (v.duration) { v.pause(); play.textContent = '▶'; v.currentTime = (Number(range.value) / 1000) * v.duration; } });
  play.addEventListener('click', () => { if (v.paused) { if (v.ended) v.currentTime = 0; v.play(); play.textContent = '❚❚'; } else { v.pause(); play.textContent = '▶'; } });
  v.play().catch(() => { play.textContent = '▶'; });
}
function closeViewer() {
  const v = $('#viewer');
  if (viewer.video) viewer.video.pause();
  v.classList.remove('show');
  document.body.classList.remove('modal-open');
  setTimeout(() => { v.hidden = true; $('#viewer-stage').innerHTML = ''; }, 250);
  history.replaceState(null, '', location.pathname + '#' + viewer.from);
}
function setupViewer() {
  $('#works-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) openViewer(b.dataset.id); });
  $('#works-more').addEventListener('click', () => { expanded = true; renderWorks(); });
  $('#viewer-close').addEventListener('click', closeViewer);
  $('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') closeViewer(); });
  addEventListener('keydown', (e) => {
    if ($('#viewer').hidden) return;
    if (e.key === 'Escape') closeViewer();
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('.vs-handle, input')) $(`#vw-nav [data-d="${e.key === 'ArrowRight' ? 1 : -1}"]`)?.click();
  });
}

/* ---------- at the easel: every copy the agents handed in, beside its exemplar ---------- */
let wallFam = 'highlights', wallAll = false, wallList = [];
const WALL_HIGHLIGHTS = FEATURED.slice(0, 8);
function wallRow(w) {
  const cells = RESULTS.runs.map((run) => MODES.map(([m, , colour]) => {
    const c = copyOf(w, `${run.id}:${m}`);
    if (!c) return '<div class="att"><div class="pic"></div><p class="cap">not run</p></div>';
    return `<button class="att" data-id="${w.id}" data-copy="${run.id}:${m}" type="button" aria-label="${esc(`${w.title}: ${c.label}, ${c.ok ? 'solved' : 'not solved'}`)}">
      <div class="pic"><img src="${c.src}" alt="" loading="lazy" decoding="async">${c.ok ? '<span class="seal">pass</span>' : ''}</div>
      <p class="cap"><i class="dot" style="background:${colour}"></i><span class="who-m">${esc(shortModel(run.model))} · ${m}</span>${c.ok ? '' : `<em>✕ ${c.why}</em>`}</p></button>`;
  }).join('')).join('');
  return `<div class="wall-row reveal"><button class="ex" data-id="${w.id}" data-copy="ref" type="button" aria-label="${esc(`${w.title}: the exemplar`)}">
    <div class="pic"><img src="${w.media.target.replace('target.webp', 'target_s.webp')}" alt="" loading="lazy" decoding="async">${practiceGrid(w)}</div>
    <div class="placard"><p class="t">${titleHTML(w)}</p><p class="by">${byline(w)}</p></div></button>${cells}</div>`;
}
function renderWall() {
  const all = wallFam === 'highlights' ? WALL_HIGHLIGHTS.map((id) => WORKS.find((w) => w.id === id)).filter(Boolean) : WORKS.filter((w) => w.family === wallFam);
  wallList = wallAll || all.length <= 10 ? all : all.slice(0, 8);
  const head = `<div class="wall-head"><span>The exemplar</span>${RESULTS.runs.map((r) => `<div class="who"><b>${esc(r.model)}</b>${MODES.map(([, name, colour]) =>
    `<span class="m"><i class="dot" style="background:${colour}"></i>${name}</span>`).join('')}</div>`).join('')}</div>`;
  $('#wall').innerHTML = head + wallList.map(wallRow).join('');
  const more = $('#wall-more');
  more.hidden = wallList.length === all.length;
  more.innerHTML = `Show all ${all.length} <span class="arr">↓</span>`;
  reveal($('#wall'));
}
function setupWall() {
  const count = (f) => WORKS.filter((w) => w.family === f).length;
  $('#wall-chips').innerHTML = ['<button class="chip on" data-f="highlights">Highlights</button>',
    ...ORDER.map((f) => `<button class="chip" data-f="${f}">${FAMILIES[f].zh ? `<span class="zh">${FAMILIES[f].zh}</span> ` : ''}${FAMILIES[f].name} <i>${count(f)}</i></button>`)].join('');
  $('#wall-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    wallFam = b.dataset.f; wallAll = false;
    $$('#wall-chips .chip').forEach((x) => x.classList.toggle('on', x === b));
    renderWall();
  });
  $('#wall-more').addEventListener('click', () => { wallAll = true; renderWall(); });
  $('#wall').addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) openViewer(b.dataset.id, 'compare', b.dataset.copy, wallList, 'attempts'); });
  $('#wall-note').textContent = 'One attempt per work and mode (the batch evaluation of 5 and 6 October 2026). Each copy is the sheet as the verifier replayed it, at the replay\'s resolution. ✕ picture: the picture rule failed; ✕ hand: the process rules failed.';
  renderWall();
}

/* ---------- the hand: the same character written and coloured in ---------- */
function pathD(paths) {
  return paths.map((s) => 'M' + s.p.map(([x, y]) => `${x},${y}`).join('L')).join('');
}
function renderHands(fig) {
  const y = fig.yong, wv = fig.wave, S = 227.18;
  const card = (cls, img, svg, title, meta, text, ok, why) => `<article class="hand ${cls}">
    <div class="sheet">${img ? `<img src="${img}" alt="">` : ''}${svg}</div>
    <div class="hand-top"><b>${title}</b><span>${meta}</span></div><p>${text}</p>
    <span class="verdict ${ok ? 'ok' : 'no'}">${ok ? '✓ passes' : `✕ fails: ${why}`}</span></article>`;
  const path = (paths, colour, width, extra = '') => `<path class="path" d="${pathD(paths)}" stroke="${colour}" stroke-width="${width}" ${extra}/>`;
  // a lens on the coloured-in sheet: a 5x look at the falling stroke, where the rings show
  const lens = (paths) => {
    const cx = 168, cy = 132, r = 38, z = 5, fx = 152, fy = 140;
    return `<g class="lens"><clipPath id="lensclip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--paper)"/>
      <g clip-path="url(#lensclip)"><g transform="translate(${cx} ${cy}) scale(${z}) translate(${-fx} ${-fy})">${path(paths, 'var(--seal)', 0.07, 'style="opacity:1"')}</g></g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink)" stroke-width=".6"/>
      <circle cx="${fx}" cy="${fy}" r="${r / z}" fill="none" stroke="var(--ink)" stroke-width=".4"/>
      <path d="M${fx + (r / z) * 0.7} ${fy - (r / z) * 0.7}L${cx - r * 0.7} ${cy + r * 0.7}" stroke="var(--ink)" stroke-width=".4"/></g>`;
  };
  const svg = (inner, vb = `0 0 ${S} ${S}`) => `<svg viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
  const [x0, y0, x1, y1] = wv.window_mm, vb = `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;
  const strokes = (paths, w) => paths.map((s) => `<path class="path" d="M${s.p.map(([a, b]) => `${a},${b}`).join('L')}" stroke="${s.c}" stroke-width="${w}"/>`).join('');
  $('#hands').innerHTML =
    card('', y.ref.img, svg(path(y.ref.paths, 'var(--priv)', 1.1)), 'Written', `${y.ref.strokes} strokes · ${fmt(Math.round(y.ref.path_mm))} mm of path`,
      'The reference robot writes <span class="zh">永</span> as a calligrapher does: five strokes, each pressed and lifted in the right place.', true) +
    card('', y.colourin.img, svg(path(y.colourin.paths, 'var(--seal)', 0.22) + lens(y.colourin.paths)), 'Coloured in', `5 strokes · ${fmt(Math.round(y.colourin.path_mm))} mm of path`,
      'An earlier agent run: the same five contacts, but a light tip traced round each stroke, ring inside ring, until the shape was full. The picture matched.', false, 'coloured in') +
    card('wide', wv.ref.img, svg(strokes(wv.ref.paths, 0.5), vb), 'Painted', 'a 60 mm window of the Great Wave',
      'The reference painter lays each stroke once, in one sweep, the way the form runs.', true) +
    card('wide', wv.scribble.img, svg(strokes(wv.scribble.paths, 0.32), vb), 'Scribbled', 'the same window, the same earlier run',
      'Zigzag and serpentine strokes that fill an area like a pen shading it. The picture matched; three quarters of the path were scribbles.', false, 'scribbled');
  const max = Math.max(y.colourin.path_mm, y.limit_mm) * 1.04;
  const row = (label, mm, colour) => `<div class="pb-row"><span>${label}</span><div class="bar"><i style="background:${colour}" data-w="${(mm / max) * 100}"></i>
    ${label === 'Written' ? `<span class="limit" style="left:${(y.limit_mm / max) * 100}%"><span>limit for fine marks · ${fmt(y.limit_mm)} mm</span></span>` : ''}</div><b>${fmt(Math.round(mm))} mm</b></div>`;
  $('#pathbar').innerHTML = `<p class="label" style="margin:0 0 16px">The brush's path on the sheet, <span class="zh">永</span></p>${row('Written', y.ref.path_mm, 'var(--priv)')}${row('Coloured in', y.colourin.path_mm, 'var(--seal)')}
    <p class="note" style="margin-top:14px">Writing: a path more than three times the reference's, made with marks finer than ${y.min_mark_mm} mm, is colouring in. Painting: a path
    budget, and at most ${Math.round(wv.max_scribble_share * 100)}% of it in strokes that zigzag or snake.</p>`;
  const bars = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { $$('.bar i', e.target).forEach((i) => { i.style.width = `${i.dataset.w}%`; }); bars.disconnect(); } }), { threshold: 0.4 });
  bars.observe($('#pathbar'));
  $('#hand-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    $$('#hand-seg button').forEach((x) => x.classList.toggle('on', x === b));
    $$('#hands .hand').forEach((h) => h.classList.toggle('show-path', b.dataset.v === 'path'));
  });
}

/* ---------- judging ---------- */
function renderJudging(fig, works) {
  const yong = works.find((w) => w.id === 'kaishu_yong'), starry = works.find((w) => w.id === 'oil_starrynight');
  const a = fig.agree, d = fig.delta;
  $('#judge').innerHTML = `
    <article class="jcard"><div class="viz align-viz"><img src="${yong.media.painted}" alt=""><img class="ghost" src="${a.ghost}" alt=""></div>
      <h3>Aligned first</h3><p>The sheet may sit a little off. The judge slides it up to 5 mm in each direction and keeps the best fit, then compares.</p>
      <p class="num">translation only · ±5 mm · one shift for the whole sheet</p></article>
    <article class="jcard"><div class="viz"><img src="${a.img}" alt="Where the robot's ink and the exemplar's agree"></div>
      <h3>Writing: the ink</h3><p>Black where both have ink, <span style="color:var(--std-ink)">teal</span> where the robot missed, <span style="color:var(--priv-ink)">terracotta</span> where it strayed.</p>
      <p class="num">the reference <span class="zh">永</span>: IoU <b>${a.iou.toFixed(2)}</b> · needs ≥ ${a.rule_iou}</p></article>
    <article class="jcard"><div class="viz"><img src="${d.img}" alt="The colour difference of the robot's Starry Night"></div>
      <h3>Painting: the colour</h3><p>The colour difference per point, after a 1 mm blur: pale where the paint matches, dark where it does not. Structure and edges are measured too.</p>
      <p class="num">the reference Starry Night: mean ΔE <b>${d.mean}</b> · needs ≤ ${d.rule_mean}</p></article>`;
}

/* ---------- the two modes ---------- */
function renderModes(fig) {
  $('#modes-cards').innerHTML = `
    <article class="mode open"><div class="shot"><img src="${fig.modes.exact}" alt="The exact sheet"></div><div>
      <p class="tagm">Open book · privileged</p><h3>In the studio</h3>
      <ul><li>The exact sheet, pixel for pixel</li><li>The score, whenever it asks</li><li>Start over as often as it likes</li><li>The brush's state and the paints' places</li></ul></div></article>
    <article class="mode closed"><div class="shot"><img src="${fig.modes.camera}" alt="The overhead camera's view"></div><div>
      <p class="tagm">Closed book · standard</p><h3>On stage</h3>
      <ul><li>Camera images and the robot's joints</li><li class="no">No score until the end</li><li class="no">No second try: paint is permanent</li><li class="no">No object positions</li></ul></div></article>`;
}

/* ---------- results ---------- */
function renderResults(res) {
  const pct = (s) => (100 * s.solved) / s.of;
  const rows = res.runs.map((r) => {
    const o = pct(r.summary.open), c = pct(r.summary.closed), lo = Math.min(o, c), hi = Math.max(o, c);
    return `<div class="db-row"><div class="who"><b>${esc(r.model)}</b><small>${esc(r.harness)} · reasoning ${esc(r.effort)}</small></div>
      <div class="db-track"><span class="db-line" style="--lo:${lo}%;--w:${hi - lo}%"></span>
        <span class="db-dot s" style="--x:${c}%"><em>${r.summary.closed.solved}</em></span><span class="db-dot p" style="--x:${o}%"><em>${r.summary.open.solved}</em></span></div>
      <div class="db-gap">${Math.round(o - c)}<small>points lost</small></div></div>`;
  }).join('');
  $('#dumbbell').innerHTML = `<div class="db-legend"><span><i class="dot" style="background:var(--priv)"></i>Open book</span><span><i class="dot" style="background:var(--std)"></i>Closed book</span>
    <span style="margin-left:auto;color:var(--ink-3)">works solved of 82</span></div>
    <div class="db-axis"><span class="who-h"></span><div class="db-ticks">${[0, 25, 50, 75, 100].map((t) => `<span style="left:${t}%">${t}%</span>`).join('')}</div><span class="db-gap-h">gap</span></div>${rows}`;
  $('#fam-grid').innerHTML = ORDER.map((f) => {
    const n = res.runs[0].summary.open.families[f].of;
    const bar = (k, cls) => `<span class="fb"><i class="${cls}" style="width:${(100 * k) / n}%"></i></span><b>${k}</b>`;
    const runs = res.runs.map((r) => `<div class="fam-row"><span>${esc(r.model.replace('GPT-6 ', ''))}</span>
      <div class="fam-bars">${bar(r.summary.open.families[f].solved, 'p')}${bar(r.summary.closed.families[f].solved, 's')}</div></div>`).join('');
    return `<div class="fam"><h4>${FAMILIES[f].zh ? `<span class="zh">${FAMILIES[f].zh}</span>` : ''}${FAMILIES[f].name} <span>${n} works</span></h4>${runs}</div>`;
  }).join('');
  $('#results-note').textContent = 'Codex with each model, one attempt per work and mode (the batch evaluation of 5 and 6 October 2026). Agents had two hours per work.';
}

/* ---------- start ---------- */
setupNav();
const [worksData, resultsData, figData, attemptsData] = await Promise.all(['works', 'results', 'figures', 'attempts'].map((n) => fetch(`assets/data/${n}.json`).then((r) => r.json())));
WORKS = worksData.works;
RESULTS = resultsData; COPIES = attemptsData.copies;
renderNumbers(WORKS);
renderChips();
renderWorks();
setupViewer();
renderHands(figData);
renderJudging(figData, WORKS);
renderModes(figData);
renderResults(resultsData);
setupWall();
reveal();
if (params.get('work')) openViewer(params.get('work'), params.get('view') === 'time' ? 'time' : 'compare', params.get('copy') || 'ref', null, params.get('copy') ? 'attempts' : 'works');
const focus = params.get('focus');
if (focus) requestAnimationFrame(() => { document.getElementById(focus)?.scrollIntoView({ behavior: 'instant', block: 'start' }); $$('.reveal').forEach((r) => r.classList.add('in')); });
import('./hero.js').then(({ initHero }) => initHero({ section: $('#top'), canvas: $('#hero-canvas'), frozen: params.has('hero') ? Number(params.get('hero')) : null }))
  .catch((err) => { console.error(err); $('#top').classList.add('no-webgl'); });
