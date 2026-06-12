// Generates the PWA icons (fuel-pump glyph on amber) without native image
// tooling: raw RGBA buffer → minimal PNG encoder via node:zlib.
// Run: node scripts/generate-icons.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const AMBER = [217, 119, 6, 255]; // ≈ accent hue 55
const WHITE = [255, 255, 255, 255];

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcon(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y += 1) {
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x += 1) {
        set(x, y, color);
      }
    }
  };

  // Background: full bleed for maskable, rounded corners for regular.
  rect(0, 0, 1, 1, AMBER);
  if (!maskable) {
    const r = Math.round(size * 0.18);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const cx = x < r ? r : x >= size - r ? size - r - 1 : x;
        const cy = y < r ? r : y >= size - r ? size - r - 1 : y;
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) set(x, y, [0, 0, 0, 0]);
      }
    }
  }

  // Fuel pump: body, display window, base plate, hose pipe + nozzle.
  rect(0.26, 0.2, 0.6, 0.76, WHITE);
  rect(0.32, 0.27, 0.54, 0.42, AMBER);
  rect(0.22, 0.76, 0.64, 0.83, WHITE);
  rect(0.6, 0.32, 0.72, 0.38, WHITE);
  rect(0.68, 0.32, 0.74, 0.62, WHITE);
  rect(0.64, 0.62, 0.8, 0.69, WHITE);

  return encodePng(px, size);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", makeIcon(192, { maskable: false }));
writeFileSync("public/icon-512.png", makeIcon(512, { maskable: false }));
writeFileSync("public/icon-maskable.png", makeIcon(512, { maskable: true }));
process.stdout.write("icons written to public/\n");
