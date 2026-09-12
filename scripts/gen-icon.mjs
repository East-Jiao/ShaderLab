// 生成应用图标：用纯 Node（内置 zlib）绘制 512x512 PNG，再转成 Windows .ico
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import png2icons from 'png2icons';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S = 512;
const cx = S / 2, cy = S / 2;

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const len = (x, y) => Math.hypot(x, y);

function hash(n) { return ((Math.sin(n * 127.1) * 43758.5453) % 1 + 1) % 1; }

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const p = (x + y * S) * 4;
    // 背景：圆角矩形 + 深色渐变
    const r = 0.16 * S;
    const dx = Math.max(Math.abs(x - cx) - (cx - r), 0), dy = Math.max(Math.abs(y - cy) - (cy - r), 0);
    const corner = len(dx, dy) > r;
    let R, G, B, A;
    if (corner) { px[p + 3] = 0; continue; }
    A = 255;
    const g = smooth(0, 1, (u + v) / 2);
    R = mix(0x1c, 0x24, g); G = mix(0x1f, 0x2e, g); B = mix(0x2a, 0x3f, g);
    // 中心辉光
    const d = len(x - cx, y - cy) / S;
    const glow = Math.exp(-d * 4.2) * 0.5;
    R = mix(R, 0x58, glow); G = mix(G, 0xa8, glow); B = mix(B, 0xff, glow);
    // “Shader 球”主体
    const bx = (x - cx) / (S * 0.30), by = (y - cy) / (S * 0.30);
    const bd = len(bx, by);
    if (bd < 1.0) {
      // 球面法线近似
      const nz = Math.sqrt(Math.max(0, 1 - bd * bd));
      const Lx = -0.5, Ly = -0.65, Lz = 0.6;
      const dl = Math.hypot(Lx, Ly, Lz);
      let diff = Math.max(0, (bx * Lx + by * Ly + nz * Lz) / dl);
      diff = diff * diff * 0.9 + 0.08;
      // 波纹图案（像 shader 输出）
      const ang = Math.atan2(by, bx);
      const wave = 0.5 + 0.5 * Math.sin(ang * 3 + bd * 9.0);
      const wave2 = 0.5 + 0.5 * Math.sin(bd * 22 - wave * 3);
      const tint = mix(wave, wave2, 0.5);
      R = mix(0x1a, 0xff, diff * (0.25 + 0.75 * tint));
      G = mix(0x2e, 0xd1, diff * (0.3 + 0.7 * tint));
      B = mix(0x5a, 0x5f, diff * (0.35 + 0.65 * (1 - tint)));
      // 菲涅尔亮边
      const fres = Math.pow(bd, 3.2) * 1.4;
      R = mix(R, 0xff, clamp01(fres * 0.9));
      G = mix(G, 0xff, clamp01(fres * 0.9));
      B = mix(B, 0xff, clamp01(fres * 0.9));
    }
    // 高光点
    const sd = len(bx + 0.38, by + 0.42);
    const spec = Math.exp(-sd * sd * 26) * 0.95;
    R = mix(R, 255, spec); G = mix(G, 255, spec); B = mix(B, 255, spec);
    // 星点
    for (let i = 0; i < 26; i++) {
      const sx = hash(i * 3.7 + 1) * S, sy = hash(i * 7.3 + 5) * S;
      if (len(x - sx, y - sy) < 1.6 && len((sx - cx) / S, (sy - cy) / S) > 0.34) {
        R = 255; G = 255; B = 255;
      }
    }
    px[p] = R | 0; px[p + 1] = G | 0; px[p + 2] = B | 0; px[p + 3] = A;
  }
}

const png = encodePNG(px, S, S);
const buildDir = path.join(__dirname, '..', 'build');
const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
const ico = png2icons.createICO(png, png2icons.BICUBIC, 0, true, false);
if (!ico) throw new Error('ico 转换失败');
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
console.log('✅ 已生成 build/icon.png 与 build/icon.ico (' + png.length + ' bytes png)');
