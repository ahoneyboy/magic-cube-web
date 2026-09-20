#!/usr/bin/env node
/**
 * gen-icons.mjs —— 生成 PWA 图标（纯 Node，无依赖）
 * 画法：品牌橙圆角背景 + 3×3 魔方贴纸（标准配色，含色弱高对比描边效果由色块本身表达）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(import.meta.dirname, '../public/icons');
fs.mkdirSync(OUT, { recursive: true });

const BG = [255, 138, 61]; // #FF8A3D
const STICKERS = {
  U: [248, 250, 252],
  R: [255, 107, 107],
  F: [81, 207, 102],
  D: [255, 217, 61],
  L: [255, 169, 77],
  B: [51, 154, 240]
};
const FACE_GRID = [
  ['U', 'L', 'F'],
  ['R', 'U', 'B'],
  ['F', 'D', 'L']
];

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function raster(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const pad = size * 0.09; // 外边距
  const board = size - pad * 2;
  const cellGap = board * 0.045;
  const cell = (board - cellGap * 2) / 3;
  const cornerR = size * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = null;
      // 背景圆角（maskable 全出血，非 maskable 圆角）
      const rounded = size >= 510 ? true : inRoundedRect(x, y, 0, 0, size - 1, size - 1, cornerR);
      if (!rounded) continue;
      color = BG;
      // 3×3 贴纸
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const x0 = pad + c * (cell + cellGap);
          const y0 = pad + r * (cell + cellGap);
          if (inRoundedRect(x, y, x0, y0, x0 + cell, y0 + cell, cell * 0.22)) {
            color = STICKERS[FACE_GRID[r][c]];
          }
        }
      }
      const o = (y * size + x) * 4;
      buf[o] = color[0];
      buf[o + 1] = color[1];
      buf[o + 2] = color[2];
      buf[o + 3] = 255;
    }
  }
  return buf;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true]
]) {
  const rgba = raster(size);
  fs.writeFileSync(path.join(OUT, name), encodePNG(rgba, size));
  console.log('wrote', name, size + 'x' + size, maskable ? '(maskable: 全出血)' : '');
}
