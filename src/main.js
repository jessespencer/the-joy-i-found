const BATCH = 60;
const MAX_CELLS = 600;
const SHUFFLE = true;
const SPOTLIGHT = false;
const NEAR_BOTTOM_PX = 800;

const modules = import.meta.glob('../images/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
});
const SOURCES = Object.values(modules);

const wall = document.getElementById('wall');
const sentinel = document.getElementById('sentinel');

if (SPOTLIGHT) document.body.classList.add('spotlight');

if (SOURCES.length === 0) {
  // Nothing to show; leave wall empty and skip observer wiring.
} else {
  appendBatch();
  appendBatch();

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) appendBatch();
    }
  }, { rootMargin: `${NEAR_BOTTOM_PX}px` });
  io.observe(sentinel);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCell(src) {
  const div = document.createElement('div');
  div.className = 'cell';
  const img = document.createElement('img');
  img.src = src;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  div.appendChild(img);
  return div;
}

function appendBatch() {
  const order = SHUFFLE ? shuffle(SOURCES) : SOURCES;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < BATCH; i++) {
    frag.appendChild(makeCell(order[i % order.length]));
  }
  wall.appendChild(frag);
  prune();
}

function prune() {
  const excess = wall.children.length - MAX_CELLS;
  if (excess <= 0) return;
  const heightBefore = wall.scrollHeight;
  for (let i = 0; i < excess; i++) wall.removeChild(wall.firstChild);
  const removed = heightBefore - wall.scrollHeight;
  if (removed > 0) window.scrollTo({ top: window.scrollY - removed, behavior: 'instant' });
}
