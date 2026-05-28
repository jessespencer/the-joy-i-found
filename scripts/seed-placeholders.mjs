// One-shot zero-dep PNG generator. Produces /images/01.png .. /images/08.png
// as 256x256 images with subtle gradients. Run once: `node scripts/seed-placeholders.mjs`
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 256;
const H = 256;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'images');
mkdirSync(OUT, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePng(rgbFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const [r, g, b] = rgbFn(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Eight gradients across a muted palette.
const palettes = [
  [[210, 90, 70], [330, 60, 35]],
  [[20, 80, 75],  [350, 70, 40]],
  [[180, 50, 60], [260, 60, 35]],
  [[40, 70, 70],  [10, 80, 40]],
  [[140, 50, 55], [220, 60, 30]],
  [[280, 50, 60], [320, 70, 40]],
  [[60, 60, 65],  [160, 50, 30]],
  [[200, 40, 55], [240, 60, 25]],
];

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

palettes.forEach(([from, to], i) => {
  const png = makePng((x, y) => {
    const t = (x + y) / (W + H - 2);
    const h = from[0] + (to[0] - from[0]) * t;
    const s = from[1] + (to[1] - from[1]) * t;
    const l = from[2] + (to[2] - from[2]) * t;
    return hslToRgb(h, s, l);
  });
  const n = String(i + 1).padStart(2, '0');
  writeFileSync(resolve(OUT, `${n}.png`), png);
});

console.log(`Wrote ${palettes.length} placeholders to ${OUT}`);
