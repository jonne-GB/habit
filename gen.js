const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG builder ──
function makePNG(w, h, pixels) {
  // pixels: Uint8Array of length w*h*4 (RGBA)
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 4) + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 6 });

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb  = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Drawing helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexToRGB(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function blend(dst, src, alpha) {
  // alpha-composite src over dst (both RGBA arrays)
  const a = alpha / 255;
  return [
    Math.round(lerp(dst[0], src[0], a)),
    Math.round(lerp(dst[1], src[1], a)),
    Math.round(lerp(dst[2], src[2], a)),
    255
  ];
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  const cx = size / 2, cy = size / 2;
  const R_CORNER = size * 0.2237;
  const circleR  = size * 0.335;

  // Colors
  const BG    = [29, 28, 30];
  const C1    = hexToRGB('#7C6FF7'); // inner gradient
  const C2    = hexToRGB('#0A84FF'); // outer gradient
  const WHITE = [255, 255, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // ── Rounded-rect mask ──
      const rx = x - cx, ry = y - cy;
      const hw = size/2 - R_CORNER, hh = size/2 - R_CORNER;
      const qx = Math.max(0, Math.abs(rx) - hw);
      const qy = Math.max(0, Math.abs(ry) - hh);
      const cornerDist = Math.sqrt(qx*qx + qy*qy);
      const inRect = cornerDist < R_CORNER - 0.5;
      const rectAA = clamp(R_CORNER - cornerDist, 0, 1);

      if (!inRect && rectAA < 0.01) {
        pixels[i+3] = 0; continue;
      }

      // Base = BG
      let r = BG[0], g = BG[1], b = BG[2], a = Math.round(rectAA * 255);
      if (inRect) a = 255;

      // ── Circle with radial gradient ──
      const dist = Math.sqrt(rx*rx + ry*ry);
      const circleAA = clamp(circleR + 1 - dist, 0, 1);

      if (circleAA > 0) {
        // gradient: C1 at center, C2 at edge
        const t = clamp(dist / circleR, 0, 1);
        const cr = Math.round(lerp(C1[0], C2[0], t));
        const cg = Math.round(lerp(C1[1], C2[1], t));
        const cb = Math.round(lerp(C1[2], C2[2], t));

        // Top-left highlight
        const angle = Math.atan2(ry, rx);
        const hlIntensity = clamp((-angle - Math.PI/4) / Math.PI * 0.4 + 0.1, 0, 0.25);
        const hlR = Math.round(lerp(cr, 255, hlIntensity));
        const hlG = Math.round(lerp(cg, 255, hlIntensity));
        const hlB = Math.round(lerp(cb, 255, hlIntensity));

        const alpha = Math.round(circleAA * 255);
        [r, g, b] = blend([r, g, b], [hlR, hlG, hlB], alpha);
      }

      // ── Checkmark ──
      // Polyline: (cx - 0.115s, cy + 0.01s) → (cx - 0.01s, cy + 0.12s) → (cx + 0.155s, cy - 0.1s)
      const p0 = [cx - 0.115*size, cy + 0.01*size];
      const p1 = [cx - 0.01*size,  cy + 0.12*size];
      const p2 = [cx + 0.155*size, cy - 0.1*size];
      const lineW = size * 0.07;

      function distToSegment(px, py, ax, ay, bx, by) {
        const dx = bx-ax, dy = by-ay;
        const len2 = dx*dx + dy*dy;
        if (len2 === 0) return Math.sqrt((px-ax)**2 + (py-ay)**2);
        const t = clamp(((px-ax)*dx + (py-ay)*dy) / len2, 0, 1);
        return Math.sqrt((px - (ax+t*dx))**2 + (py - (ay+t*dy))**2);
      }

      const d0 = distToSegment(x, y, p0[0], p0[1], p1[0], p1[1]);
      const d1 = distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
      const dCheck = Math.min(d0, d1);
      const checkAA = clamp(lineW/2 + 0.8 - dCheck, 0, 1);

      if (checkAA > 0 && circleAA > 0.3) {
        const ca = Math.round(checkAA * 255);
        [r, g, b] = blend([r, g, b], WHITE, ca);
      }

      pixels[i]   = r;
      pixels[i+1] = g;
      pixels[i+2] = b;
      pixels[i+3] = a;
    }
  }
  return pixels;
}

// ── Generate all sizes ──
const sizes = [512, 192, 180, 167, 152, 120];
const outDir = path.dirname(__filename);

sizes.forEach(s => {
  process.stdout.write(`Generating ${s}x${s}... `);
  const pixels = drawIcon(s);
  const png = makePNG(s, s, pixels);
  const outPath = path.join(outDir, `icon-${s}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✓ ${outPath}`);
});
console.log('Done!');
