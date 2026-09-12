// 参数化几何体生成（position / normal / uv / index）
import type { GeometryId } from './types';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** 每顶点切线（vec3，Lengyel 算法，Gram-Schmidt 对 N 正交化）；bitangent = cross(N, T) */
  tangents?: Float32Array;
}

export function triangleCount(m: MeshData): number {
  return m.indices.length / 3;
}

/** 保证三角形环绕方向与属性法线一致（CCW 朝外），否则背面剔除后会看到内表面 */
export function fixWinding(m: MeshData): MeshData {
  const P = m.positions, N = m.normals, I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const nx = (N[i0 * 3] + N[i1 * 3] + N[i2 * 3]) / 3;
    const ny = (N[i0 * 3 + 1] + N[i1 * 3 + 1] + N[i2 * 3 + 1]) / 3;
    const nz = (N[i0 * 3 + 2] + N[i1 * 3 + 2] + N[i2 * 3 + 2]) / 3;
    if (cx * nx + cy * ny + cz * nz < 0) {
      I[t + 1] = i2;
      I[t + 2] = i1;
    }
  }
  return m;
}

function push(m: { p: number[]; n: number[]; uv: number[]; idx: number[] }, v: number[], vn: number[], t: number[]) {
  m.p.push(...v);
  m.n.push(...vn);
  m.uv.push(...t);
}

export function makePlane(size = 2, subdiv = 100, vertical = false): MeshData {
  const m = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  for (let iy = 0; iy <= subdiv; iy++) {
    for (let ix = 0; ix <= subdiv; ix++) {
      const u = ix / subdiv, v = iy / subdiv;
      if (vertical) {
        // XY 平面（旗帜/墙面），z=0，法线 +Z
        push(m, [(u - 0.5) * size, (v - 0.5) * size, 0], [0, 0, 1], [u, 1 - v]);
      } else {
        // XZ 平面（地面/水面），法线 +Y
        push(m, [(u - 0.5) * size, 0, (v - 0.5) * size], [0, 1, 0], [u, v]);
      }
    }
  }
  const row = subdiv + 1;
  for (let iy = 0; iy < subdiv; iy++) {
    for (let ix = 0; ix < subdiv; ix++) {
      const a = iy * row + ix, b = a + 1, c = a + row, d = c + 1;
      m.idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), uvs: new Float32Array(m.uv), indices: new Uint32Array(m.idx) };
}

export function makeSphere(radius = 1, segLat = 48, segLon = 64): MeshData {
  const m = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  for (let i = 0; i <= segLat; i++) {
    const theta = (i / segLat) * Math.PI; // 0..pi
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let j = 0; j <= segLon; j++) {
      const phi = (j / segLon) * Math.PI * 2;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const nx = st * cp, ny = ct, nz = st * sp;
      push(m, [nx * radius, ny * radius, nz * radius], [nx, ny, nz], [j / segLon, 1 - i / segLat]);
    }
  }
  const row = segLon + 1;
  for (let i = 0; i < segLat; i++) {
    for (let j = 0; j < segLon; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      m.idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), uvs: new Float32Array(m.uv), indices: new Uint32Array(m.idx) };
}

export function makeTorus(R = 1, r = 0.4, segT = 72, segP = 36): MeshData {
  const m = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  for (let i = 0; i <= segT; i++) {
    const u = (i / segT) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= segP; j++) {
      const v = (j / segP) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const nx = cv * cu, ny = sv, nz = cv * su;
      push(
        m,
        [(R + r * cv) * cu, r * sv, (R + r * cv) * su],
        [nx, ny, nz],
        [i / segT, j / segP],
      );
    }
  }
  const row = segP + 1;
  for (let i = 0; i < segT; i++) {
    for (let j = 0; j < segP; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      m.idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), uvs: new Float32Array(m.uv), indices: new Uint32Array(m.idx) };
}

export function makeTorusKnot(p = 2, q = 3, radius = 1, tube = 0.32, segT = 200, segP = 24): MeshData {
  const m = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  const curve = (t: number): [number, number, number] => {
    const cu = Math.cos(p * t * Math.PI * 2), su = Math.sin(p * t * Math.PI * 2);
    const quOverP = (q / p) * t * Math.PI * 2;
    const cs = Math.cos(quOverP);
    return [radius * (2 + cs) * 0.5 * cu, radius * (2 + cs) * su * 0.5, radius * Math.sin(quOverP) * 0.5];
  };
  const P = (t: number) => curve(t / segT);
  const verts: [number, number, number][] = [];
  const tangents: [number, number, number][] = [];
  for (let i = 0; i <= segT; i++) {
    verts.push(P(i));
    const a = P(Math.max(0, i - 1)), b = P(Math.min(segT, i + 1));
    const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d) || 1;
    tangents.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  for (let i = 0; i <= segT; i++) {
    const [cxp, cyp, czp] = verts[i];
    const T = tangents[i];
    // 参考 N（近似朝外）
    let N: [number, number, number] = [0, 1, 0];
    if (Math.abs(T[1]) > 0.9) N = [0, 0, 1];
    // B = T x N
    const B: [number, number, number] = [
      T[1] * N[2] - T[2] * N[1],
      T[2] * N[0] - T[0] * N[2],
      T[0] * N[1] - T[1] * N[0],
    ];
    const bl = Math.hypot(...B) || 1;
    B[0] /= bl; B[1] /= bl; B[2] /= bl;
    // N = B x T
    N = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
    for (let j = 0; j <= segP; j++) {
      const v = (j / segP) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const nx = cv * N[0] + sv * B[0];
      const ny = cv * N[1] + sv * B[1];
      const nz = cv * N[2] + sv * B[2];
      push(
        m,
        [cxp + tube * nx, cyp + tube * ny, czp + tube * nz],
        [nx, ny, nz],
        [i / segT, j / segP],
      );
    }
  }
  const row = segP + 1;
  for (let i = 0; i < segT; i++) {
    for (let j = 0; j < segP; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      m.idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), uvs: new Float32Array(m.uv), indices: new Uint32Array(m.idx) };
}

export function makeCube(size = 1.4): MeshData {
  const s = size / 2;
  const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
  const face = (normal: number[], corners: number[][]) => {
    const base = p.length / 3;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      p.push(...corners[i]);
      n.push(...normal);
      uv.push(...uvs[i]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face([0, 0, 1], [[-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]]);
  face([0, 0, -1], [[s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, s, -s]]);
  face([1, 0, 0], [[s, -s, s], [s, -s, -s], [s, s, -s], [s, s, s]]);
  face([-1, 0, 0], [[-s, -s, -s], [-s, -s, s], [-s, s, s], [-s, s, -s]]);
  face([0, 1, 0], [[-s, s, s], [s, s, s], [s, s, -s], [-s, s, -s]]);
  face([0, -1, 0], [[-s, -s, -s], [s, -s, -s], [s, -s, s], [-s, -s, s]]);
  return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint32Array(idx) };
}

export function makeCylinder(radius = 0.8, height = 1.8, seg = 48): MeshData {
  const m = { p: [] as number[], n: [] as number[], uv: [] as number[], idx: [] as number[] };
  const h = height / 2;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      m.p.push(nx * radius, h, nz * radius); m.n.push(nx, 0, nz); m.uv.push(i / seg, 1);
      m.p.push(nx * radius, -h, nz * radius); m.n.push(nx, 0, nz); m.uv.push(i / seg, 0);
    }
    const base = (side * (seg + 1) * 2);
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2, b = a + 1;
      m.idx.push(a, b, a + 2, b, b + 2, a + 2);
    }
  }
  // 顶/底盖
  const capY = [h, -h], capN = [0, 1, 0, 0, -1, 0];
  for (let c = 0; c < 2; c++) {
    const centerIdx = m.p.length / 3;
    m.p.push(0, capY[c], 0); m.n.push(capN[c * 3], capN[c * 3 + 1], capN[c * 3 + 2]); m.uv.push(0.5, 0.5);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      m.p.push(nx * radius, capY[c], nz * radius);
      m.n.push(capN[c * 3], capN[c * 3 + 1], capN[c * 3 + 2]);
      m.uv.push(0.5 + nx * 0.5, 0.5 + nz * 0.5);
    }
    for (let i = 0; i < seg; i++) {
      if (c === 0) m.idx.push(centerIdx, centerIdx + 1 + i, centerIdx + 2 + i);
      else m.idx.push(centerIdx, centerIdx + 2 + i, centerIdx + 1 + i);
    }
  }
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), uvs: new Float32Array(m.uv), indices: new Uint32Array(m.idx) };
}

/**
 * 逐顶点切线计算（Lengyel《Mathematics for 3D Game Programming》§7.8 /
 * terathon.com tangent-space 标准算法）：
 * 对每个三角形由 Δuv/Δposition 求切线，按顶点累加，
 * 最后用 Gram-Schmidt 对法线正交化（bitangent = cross(N, T) 着色器里现算）。
 * MikkTSpace 为行业标准实现（需要展开网格），此处为等价的索引网格简化版。
 */
export function computeTangents(m: MeshData): Float32Array {
  const n = m.positions.length / 3;
  const tan1 = new Float32Array(n * 3);
  const P = m.positions, UV = m.uvs, I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    const x0 = P[i0 * 3], y0 = P[i0 * 3 + 1], z0 = P[i0 * 3 + 2];
    const x1 = P[i1 * 3], y1 = P[i1 * 3 + 1], z1 = P[i1 * 3 + 2];
    const x2 = P[i2 * 3], y2 = P[i2 * 3 + 1], z2 = P[i2 * 3 + 2];
    const u0 = UV[i0 * 2], v0 = UV[i0 * 2 + 1];
    const u1 = UV[i1 * 2], v1 = UV[i1 * 2 + 1];
    const u2 = UV[i2 * 2], v2 = UV[i2 * 2 + 1];
    const d1x = x1 - x0, d1y = y1 - y0, d1z = z1 - z0;
    const d2x = x2 - x0, d2y = y2 - y0, d2z = z2 - z0;
    const du1 = u1 - u0, dv1 = v1 - v0;
    const du2 = u2 - u0, dv2 = v2 - v0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-10) continue;
    const r = 1 / det;
    const tx = r * (dv2 * d1x - dv1 * d2x), ty = r * (dv2 * d1y - dv1 * d2y), tz = r * (dv2 * d1z - dv1 * d2z);
    for (const idx of [i0, i1, i2]) {
      tan1[idx * 3] += tx; tan1[idx * 3 + 1] += ty; tan1[idx * 3 + 2] += tz;
    }
  }
  const tangents = new Float32Array(n * 3);
  const N = m.normals;
  for (let i = 0; i < n; i++) {
    const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    let tx = tan1[i * 3], ty = tan1[i * 3 + 1], tz = tan1[i * 3 + 2];
    // Gram-Schmidt：T = normalize(T - N·dot(N,T))
    const dot = nx * tx + ny * ty + nz * tz;
    tx -= nx * dot; ty -= ny * dot; tz -= nz * dot;
    const l = Math.hypot(tx, ty, tz);
    if (l > 1e-8) { tangents[i * 3] = tx / l; tangents[i * 3 + 1] = ty / l; tangents[i * 3 + 2] = tz / l; }
    else {
      // 退化 UV：任取与 N 垂直的方向
      if (Math.abs(nz) < 0.999) { tangents[i * 3] = -ny; tangents[i * 3 + 1] = nx; tangents[i * 3 + 2] = 0; }
      else { tangents[i * 3] = 1; tangents[i * 3 + 1] = 0; tangents[i * 3 + 2] = 0; }
    }
  }
  return tangents;
}

/** 正二十面体顶点（黄金比例构造），用于 icosphere 细分 */
function icosahedron(): { verts: number[][]; faces: number[][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { verts, faces };
}

/** Icosphere：均匀三角形分布的球（细分正二十面体），比 UV 球更接近建模/引擎习惯 */
export function makeIcosphere(radius = 1, subdiv = 3): MeshData {
  const { verts, faces } = icosahedron();
  const cache = new Map<string, number>();
  const p: number[] = [], idx: number[] = [];
  const addVert = (v: number[]): number => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    p.push((v[0] / l) * radius, (v[1] / l) * radius, (v[2] / l) * radius);
    return p.length / 3 - 1;
  };
  const base: number[] = verts.map((v) => addVert(v));
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let m = cache.get(key);
    if (m === undefined) {
      const pa = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]];
      const pb = [p[b * 3], p[b * 3 + 1], p[b * 3 + 2]];
      m = addVert([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
      cache.set(key, m);
    }
    return m;
  };
  let tris = faces;
  for (let s = 0; s < subdiv; s++) {
    const next: number[][] = [];
    for (const [a, b, c] of tris) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    tris = next;
  }
  for (const [a, b, c] of tris) idx.push(a, b, c);
  const positions = new Float32Array(p);
  const normals = new Float32Array(p.length);
  const uvs = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length / 3; i++) {
    // 球面 UV（经纬映射；极点与接缝处有拉伸，接受）
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l;
    uvs[i * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    uvs[i * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, y / l))) / Math.PI + 0.5;
  }
  void base;
  return fixWinding({ positions, normals, uvs, indices: new Uint32Array(idx) });
}

export function makeGeometry(id: GeometryId): MeshData {
  const g: Record<GeometryId, () => MeshData> = {
    sphere: () => makeSphere(),
    icosphere: () => makeIcosphere(1, 4),
    torus: () => makeTorus(),
    torusKnot: () => makeTorusKnot(),
    cube: () => makeCube(),
    plane: () => makePlane(2.6, 120),
    flag: () => makePlane(2.6, 90, true),
    cylinder: () => makeCylinder(),
  };
  const mesh = fixWinding(g[id]());
  if (id !== 'cube') mesh.tangents = computeTangents(mesh); // 立方体 UV 不连续，切线意义不大
  return mesh;
}
