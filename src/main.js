const ASPECT_W = 16;
const ASPECT_H = 9;
const TARGET_VISIBLE = 8;
const GAP = 8;
const BUFFER_CELLS = 2;
const FRICTION = 0.92;
const MIN_VELOCITY = 0.05;
const VELOCITY_SAMPLE_MS = 60;
const SPOTLIGHT = false;

const modules = import.meta.glob('../images/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
});
const SOURCES = Object.values(modules).map((src) => {
  const m = /(\d{4})_/.exec(src);
  return { src, year: m ? m[1] : '' };
});

const viewport = document.getElementById('viewport');
const wall = document.getElementById('wall');

if (SPOTLIGHT) document.body.classList.add('spotlight');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  offsetX: 0,
  offsetY: 0,
  velX: 0,
  velY: 0,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  samples: [],
  cellW: 0,
  cellH: 0,
  strideX: 0,
  strideY: 0,
};

const cells = new Map();
let rafId = null;
let lastFrameTime = 0;

function computeCellDims() {
  const vw = viewport.clientWidth || window.innerWidth;
  const vh = viewport.clientHeight || window.innerHeight;
  const area = (vw * vh) / TARGET_VISIBLE;
  const cellW = Math.round(Math.sqrt(area * (ASPECT_W / ASPECT_H)));
  const cellH = Math.round(cellW * (ASPECT_H / ASPECT_W));
  state.cellW = cellW;
  state.cellH = cellH;
  state.strideX = cellW + GAP;
  state.strideY = cellH + GAP;
  document.documentElement.style.setProperty('--cell-w', cellW + 'px');
  document.documentElement.style.setProperty('--cell-h', cellH + 'px');
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTileDims(n, ratio) {
  if (n <= 1) return [1, 1];
  const target = Math.sqrt(n * ratio);
  const lo = Math.max(1, Math.floor(target / 1.5));
  const hi = Math.ceil(target * 1.5);
  for (let w = lo; w <= hi; w++) {
    if (n % w === 0) return [w, n / w];
  }
  const w = Math.max(1, Math.round(target));
  return [w, Math.ceil(n / w)];
}

const [TILE_W, TILE_H] = pickTileDims(SOURCES.length, ASPECT_W / ASPECT_H);

const TILE = (() => {
  const size = TILE_W * TILE_H;
  const arr = new Array(size);
  for (let i = 0; i < size; i++) arr[i] = i % Math.max(1, SOURCES.length);
  const rng = mulberry32(0xC0FFEE);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

function pickImage(col, row) {
  if (SOURCES.length === 0) return null;
  const x = ((col % TILE_W) + TILE_W) % TILE_W;
  const y = ((row % TILE_H) + TILE_H) % TILE_H;
  return SOURCES[TILE[y * TILE_W + x]];
}

function key(col, row) {
  return col + ',' + row;
}

function mountCell(col, row) {
  const entry = pickImage(col, row);
  if (!entry) return null;
  const div = document.createElement('div');
  div.className = 'cell';
  div.style.transform = `translate3d(${col * state.strideX}px, ${row * state.strideY}px, 0)`;
  const img = document.createElement('img');
  img.src = entry.src;
  img.decoding = 'async';
  img.alt = '';
  div.appendChild(img);
  if (entry.year) {
    const label = document.createElement('span');
    label.className = 'year';
    label.textContent = entry.year;
    div.appendChild(label);
  }
  wall.appendChild(div);
  return div;
}

function clearCells() {
  for (const el of cells.values()) el.remove();
  cells.clear();
}

function reconcile() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  const minCol = Math.floor(-state.offsetX / state.strideX) - BUFFER_CELLS;
  const maxCol = Math.ceil((-state.offsetX + w) / state.strideX) + BUFFER_CELLS;
  const minRow = Math.floor(-state.offsetY / state.strideY) - BUFFER_CELLS;
  const maxRow = Math.ceil((-state.offsetY + h) / state.strideY) + BUFFER_CELLS;

  for (const [k, el] of cells) {
    const [c, r] = k.split(',').map(Number);
    if (c < minCol || c > maxCol || r < minRow || r > maxRow) {
      el.remove();
      cells.delete(k);
    }
  }

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const k = key(c, r);
      if (!cells.has(k)) {
        const el = mountCell(c, r);
        if (el) cells.set(k, el);
      }
    }
  }
}

function applyTransform() {
  wall.style.transform = `translate3d(${state.offsetX}px, ${state.offsetY}px, 0)`;
}

function tick(now) {
  rafId = null;
  const dt = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  if (!state.dragging && (Math.abs(state.velX) > MIN_VELOCITY || Math.abs(state.velY) > MIN_VELOCITY)) {
    const frames = dt / 16.6667;
    state.offsetX += state.velX * frames;
    state.offsetY += state.velY * frames;
    const decay = Math.pow(FRICTION, frames);
    state.velX *= decay;
    state.velY *= decay;
    if (Math.abs(state.velX) < MIN_VELOCITY) state.velX = 0;
    if (Math.abs(state.velY) < MIN_VELOCITY) state.velY = 0;
    applyTransform();
    reconcile();
    if (state.velX !== 0 || state.velY !== 0) schedule();
    else lastFrameTime = 0;
  } else {
    lastFrameTime = 0;
  }
}

function schedule() {
  if (rafId == null) rafId = requestAnimationFrame(tick);
}

function pan(dx, dy) {
  state.offsetX += dx;
  state.offsetY += dy;
  applyTransform();
  reconcile();
}

function sampleVelocity(x, y) {
  const now = performance.now();
  state.samples.push({ t: now, x, y });
  const cutoff = now - VELOCITY_SAMPLE_MS;
  while (state.samples.length > 2 && state.samples[0].t < cutoff) {
    state.samples.shift();
  }
}

function computeReleaseVelocity() {
  if (state.samples.length < 2) return { vx: 0, vy: 0 };
  const first = state.samples[0];
  const last = state.samples[state.samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  const framePeriod = 16.6667;
  return {
    vx: ((last.x - first.x) / dt) * framePeriod,
    vy: ((last.y - first.y) / dt) * framePeriod,
  };
}

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.velX = 0;
  state.velY = 0;
  pan(-e.deltaX, -e.deltaY);
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  state.dragging = true;
  state.pointerId = e.pointerId;
  state.velX = 0;
  state.velY = 0;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  state.samples = [];
  sampleVelocity(e.clientX, e.clientY);
  viewport.classList.add('dragging');
  viewport.setPointerCapture(e.pointerId);
});

viewport.addEventListener('pointermove', (e) => {
  if (!state.dragging || e.pointerId !== state.pointerId) return;
  const dx = e.clientX - state.lastX;
  const dy = e.clientY - state.lastY;
  state.lastX = e.clientX;
  state.lastY = e.clientY;
  sampleVelocity(e.clientX, e.clientY);
  pan(dx, dy);
});

function endDrag(e) {
  if (!state.dragging || e.pointerId !== state.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
  viewport.classList.remove('dragging');
  try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!prefersReducedMotion) {
    const { vx, vy } = computeReleaseVelocity();
    state.velX = vx;
    state.velY = vy;
    if (Math.abs(state.velX) > MIN_VELOCITY || Math.abs(state.velY) > MIN_VELOCITY) {
      schedule();
    }
  }
  state.samples = [];
}

viewport.addEventListener('pointerup', endDrag);
viewport.addEventListener('pointercancel', endDrag);

window.addEventListener('resize', () => {
  computeCellDims();
  clearCells();
  reconcile();
});

computeCellDims();
state.offsetX = -Math.random() * TILE_W * state.strideX;
state.offsetY = -Math.random() * TILE_H * state.strideY;
reconcile();
applyTransform();
