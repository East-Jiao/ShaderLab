// 程序化纹理生成（离线 Canvas 绘制，无需外部资源即可运行）
export type TextureId =
  | 'white' | 'black' | 'checker' | 'uvgrid' | 'noise' | 'brick' | 'stripes' | 'gradient' | 'matcap' | 'rings'
  | 'normalmap';

const SIZE = 256;

function makeCanvas(size = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function hash2(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, oct = 5, seed = 0): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, y * f, seed + i) * amp;
    amp *= 0.5; f *= 2;
  }
  return s;
}

const generators: Record<TextureId, (ctx: CanvasRenderingContext2D, size: number) => void> = {
  white: (ctx, s) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); },
  black: (ctx, s) => { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, s, s); },

  checker: (ctx, s) => {
    const n = 8, cell = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#e8e8ec' : '#3a3f4a';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  },

  uvgrid: (ctx, s) => {
    ctx.fillStyle = '#20242e'; ctx.fillRect(0, 0, s, s);
    const n = 8, cell = s / n;
    ctx.strokeStyle = '#4d9fff'; ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(s, i * cell); ctx.stroke();
    }
    ctx.fillStyle = '#ff5f5f'; ctx.beginPath(); ctx.arc(s, 0, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#5fff8a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `${s / 10}px monospace`;
    ctx.fillText('U', s * 0.04, s * 0.94);
    ctx.save(); ctx.translate(s * 0.94, s * 0.08); ctx.rotate(Math.PI / 2);
    ctx.fillText('V', 0, 0); ctx.restore();
  },

  noise: (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const v = fbm(x / 32, y / 32, 5, 7);
        const v2 = fbm(x / 8, y / 8, 3, 13);
        img.data[i] = Math.floor(v * 255);
        img.data[i + 1] = Math.floor(v2 * 255);
        img.data[i + 2] = Math.floor(((v + v2) / 2) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  brick: (ctx, s) => {
    const rows = 8, bh = s / rows, bw = s / 4;
    ctx.fillStyle = '#8c8f96'; ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : -bw / 2;
      for (let b = -1; b <= 4; b++) {
        const x = b * bw + off, y = r * bh;
        const shade = 0.85 + hash2(b, r) * 0.3;
        ctx.fillStyle = `rgb(${Math.floor(178 * shade)},${Math.floor(86 * shade)},${Math.floor(62 * shade)})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
  },

  stripes: (ctx, s) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ff8844' : '#2a2f3a';
      ctx.fillRect(0, (i * s) / n, s, s / n);
    }
  },

  gradient: (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#4d9fff');
    g.addColorStop(0.5, '#a85fff');
    g.addColorStop(1, '#ff8844');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  },

  matcap: (ctx, s) => {
    // 程序化 MatCap：金属球光照效果（棕金色调 + 顶部冷高光 + 边缘暗）
    const img = ctx.createImageData(s, s);
    const c = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const dx = (x - c) / c, dy = (y - c) / c;
        const d = Math.hypot(dx, dy);
        if (d > 1) { img.data[i + 3] = 0; continue; }
        const nz = Math.sqrt(1 - d * d);
        const diff = Math.max(0, dx * -0.45 + dy * -0.6 + nz * 0.66);
        const spec = Math.pow(Math.max(0, diff), 18) * 2.2;
        const rim = Math.pow(d, 4) * 0.9;
        const hueShift = 0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 2 + d * 5);
        const R = diff * (200 + 55 * hueShift) + spec * 255 - rim * 90;
        const G = diff * (140 + 40 * hueShift) + spec * 255 - rim * 110;
        const B = diff * (70 + 130 * (1 - hueShift)) + spec * 255 - rim * 130;
        img.data[i] = Math.min(255, Math.max(0, R));
        img.data[i + 1] = Math.min(255, Math.max(0, G));
        img.data[i + 2] = Math.min(255, Math.max(0, B));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  rings: (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const d = Math.hypot(x - s / 2, y - s / 2) / (s * 0.05);
        const v = 0.5 + 0.5 * Math.sin(d * 2.4 - fbm(x / 40, y / 40) * 3);
        img.data[i] = v * 255; img.data[i + 1] = v * 180; img.data[i + 2] = 90 + v * 80; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },

  /** 砖墙高度图 → Sobel 求梯度 → 切线空间法线贴图（业界标准流程） */
  normalmap: (ctx, s) => {
    // 1) 高度场：砖块 + 灰缝
    const height = new Float32Array(s * s);
    const rows = 8, bh = s / rows, bw = s / 4;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const r = Math.floor(y / bh);
        const off = r % 2 === 0 ? 0 : -bw / 2;
        const lx = ((x + off) % bw + bw) % bw, ly = y % bh;
        const edge = Math.min(lx, bw - lx, ly, bh - ly);
        const mortar = edge < 1.6 ? 0 : 1; // 灰缝凹陷
        const shade = 0.75 + hash2(Math.floor((x + off) / bw), r) * 0.25;
        height[y * s + x] = mortar * shade * (0.9 + 0.1 * valueNoise(x / 5, y / 5, 3));
      }
    }
    // 2) Sobel 梯度 → 法线
    const img = ctx.createImageData(s, s);
    const strength = 3.0;
    const h = (x: number, y: number) => height[(((y % s) + s) % s) * s + (((x % s) + s) % s)];
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const dx =
          (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1)) -
          (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1));
        const dy =
          (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1)) -
          (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1));
        const nx = dx * strength, ny = dy * strength, nz = 1.0;
        const l = Math.hypot(nx, ny, nz);
        img.data[i] = Math.floor(((nx / l) * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.floor(((ny / l) * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.floor(((nz / l) * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  },
};

export interface TextureLibrary {
  get(id: TextureId): TexImageSource;
  list(): { id: TextureId; label: string }[];
}

export function createTextureLibrary(): TextureLibrary {
  const cache = new Map<string, TexImageSource>();
  const labels: Record<TextureId, string> = {
    white: '纯白', black: '纯黑', checker: '棋盘格', uvgrid: 'UV 网格', noise: '噪声图',
    brick: '砖墙', stripes: '条纹', gradient: '渐变', matcap: 'MatCap 金属', rings: '年轮',
    normalmap: '砖墙法线贴图',
  };
  return {
    get(id) {
      let t = cache.get(id);
      if (!t) {
        const [canvas, ctx] = makeCanvas();
        generators[id](ctx, SIZE);
        t = canvas;
        cache.set(id, t);
      }
      return t;
    },
    list() {
      return (Object.keys(generators) as TextureId[]).map((id) => ({ id, label: labels[id] }));
    },
  };
}
