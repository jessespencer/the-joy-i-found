const CELL_SIZE = 160;
const GAP = 8;
const STRIDE = CELL_SIZE + GAP;
const BUFFER_CELLS = 2;
const FRICTION = 0.92;
const MIN_VELOCITY = 0.05;
const VELOCITY_SAMPLE_MS = 60;
const SPOTLIGHT = false;

const modules = import.meta.glob('../images/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
});
const SOURCES = Object.values(modules);

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
};

const cells = new Map();
let rafId = null;
let lastFrameTime = 0;

function pickImage(col, row) {
  if (SOURCES.length === 0) return null;
  const h = ((col * 73856093) ^ (row * 19349663)) >>> 0;
  return SOURCES[h % SOURCES.length];
}

function key(col, row) {
  return col + ',' + row;
}

function mountCell(col, row) {
  const src = pickImage(col, row);
  if (!src) return null;
  const div = document.createElement('div');
  div.className = 'cell';
  div.style.transform = `translate3d(${col * STRIDE}px, ${row * STRIDE}px, 0)`;
  const img = document.createElement('img');
  img.src = src;
  img.decoding = 'async';
  img.alt = '';
  div.appendChild(img);
  wall.appendChild(div);
  return div;
}

function reconcile() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  const minCol = Math.floor(-state.offsetX / STRIDE) - BUFFER_CELLS;
  const maxCol = Math.ceil((-state.offsetX + w) / STRIDE) + BUFFER_CELLS;
  const minRow = Math.floor(-state.offsetY / STRIDE) - BUFFER_CELLS;
  const maxRow = Math.ceil((-state.offsetY + h) / STRIDE) + BUFFER_CELLS;

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

window.addEventListener('resize', reconcile);

reconcile();
applyTransform();
