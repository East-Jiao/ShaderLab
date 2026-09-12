// 轻量 3D 数学库（列主序 mat4 / vec3）
export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export const M4 = () => new Float32Array(16) as Mat4;

export function identity(out: Mat4): Mat4 {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function perspective(out: Mat4, fovyRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function ortho(out: Mat4, l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  out.fill(0);
  out[0] = 2 / (r - l);
  out[5] = 2 / (t - b);
  out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l);
  out[13] = -(t + b) / (t - b);
  out[14] = -(f + n) / (f - n);
  out[15] = 1;
  return out;
}

export function lookAt(out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2);
  if (len < 1e-8) { z0 = 0; z1 = 0; z2 = 1; len = 1; }
  z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len < 1e-8) { x0 = 1; x1 = 0; x2 = 0; } else { x0 /= len; x1 /= len; x2 /= len; }
  const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  out.set(o);
  return out;
}

export function invert(out: Mat4, a: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(out);
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function transpose(out: Mat4, a: Mat4): Mat4 {
  const t = a.slice();
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = t[r * 4 + c];
  return out;
}

/** 模型矩阵（平移+Y轴旋转+均匀缩放） */
export function trs(out: Mat4, tx: number, ty: number, tz: number, yawRad: number, scale: number): Mat4 {
  const c = Math.cos(yawRad) * scale, s = Math.sin(yawRad) * scale;
  identity(out);
  out[0] = c; out[2] = s;
  out[5] = scale;
  out[8] = -s; out[10] = c;
  out[12] = tx; out[13] = ty; out[14] = tz;
  return out;
}

/** 从 model 矩阵求法线矩阵（mat3，列主序 9 元素） */
export function normalMatrix(out: Float32Array, model: Mat4): Float32Array {
  // 假设均匀缩放 + 旋转：直接取旋转部分并归一化
  const m = model;
  const cols = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  for (let c = 0; c < 3; c++) {
    const v = cols[c];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[c * 3] = v[0] / l;
    out[c * 3 + 1] = v[1] / l;
    out[c * 3 + 2] = v[2] / l;
  }
  return out;
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ============================================================
// 四元数（业界标准旋转表示：Unity/UE 的所有旋转内部都是四元数。
// 相比欧拉角无万向节死锁，相比矩阵插值便宜且数值稳定）
// 约定：[x, y, z, w]，单位四元数表示旋转
// ============================================================
export type Quat = Float32Array; // [x,y,z,w]

export function quatIdentity(out: Quat): Quat {
  out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1;
  return out;
}

export function quatFromAxisAngle(out: Quat, axis: Vec3, rad: number): Quat {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(rad / 2);
  out[0] = (axis[0] / l) * s;
  out[1] = (axis[1] / l) * s;
  out[2] = (axis[2] / l) * s;
  out[3] = Math.cos(rad / 2);
  return out;
}

/** 欧拉角（弧度，ZYX 顺序：先绕 Z roll、再 Y yaw、最后 X pitch）→ 四元数 */
export function quatFromEuler(out: Quat, pitchX: number, yawY: number, rollZ: number): Quat {
  const cx = Math.cos(pitchX / 2), sx = Math.sin(pitchX / 2);
  const cy = Math.cos(yawY / 2), sy = Math.sin(yawY / 2);
  const cz = Math.cos(rollZ / 2), sz = Math.sin(rollZ / 2);
  out[0] = sx * cy * cz - cx * sy * sz;
  out[1] = cx * sy * cz + sx * cy * sz;
  out[2] = cx * cy * sz - sx * sy * cz;
  out[3] = cx * cy * cz + sx * sy * sz;
  return out;
}

export function quatNormalize(out: Quat, q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  out[0] = q[0] / l; out[1] = q[1] / l; out[2] = q[2] / l; out[3] = q[3] / l;
  return out;
}

export function quatMul(out: Quat, a: Quat, b: Quat): Quat {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

/**
 * 球面插值（Slerp）—— 旋转动画的行业标准。
 * Shoemake 1985《Animating rotation with quaternion curves》。
 * 当 a·b 接近 1 时退化为 Nlerp 以避免除零（数值稳定惯例）。
 */
export function quatSlerp(out: Quat, a: Quat, b: Quat, t: number): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  if (cos < 0) { cos = -cos; b0 = -b0; b1 = -b1; b2 = -b2; b3 = -b3; }
  let s0: number, s1: number;
  if (cos > 0.9995) {
    s0 = 1 - t; s1 = t; // 极小夹角：Nlerp，避免 sin 接近 0 除零
  } else {
    const omega = Math.acos(cos);
    const sinOmega = Math.sin(omega);
    s0 = Math.sin((1 - t) * omega) / sinOmega;
    s1 = Math.sin(t * omega) / sinOmega;
  }
  out[0] = a[0] * s0 + b0 * s1;
  out[1] = a[1] * s0 + b1 * s1;
  out[2] = a[2] * s0 + b2 * s1;
  out[3] = a[3] * s0 + b3 * s1;
  return quatNormalize(out, out);
}

export function quatToMat4(out: Mat4, q: Quat): Mat4 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0;
  out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0;
  out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

/** TRS 组合（业界标准的模型矩阵构成方式）：M = T · R(quat) · S */
export function compose(out: Mat4, translation: Vec3, rotation: Quat, scale: number): Mat4 {
  quatToMat4(out, rotation);
  out[0] *= scale; out[1] *= scale; out[2] *= scale;
  out[4] *= scale; out[5] *= scale; out[6] *= scale;
  out[8] *= scale; out[9] *= scale; out[10] *= scale;
  out[12] = translation[0]; out[13] = translation[1]; out[14] = translation[2];
  return out;
}

// ============================================================
// 其他业界标准工具
// ============================================================

/**
 * 帧率无关指数阻尼（smooth damp）。
 * 公式 1 - exp(-λ·dt) 是行业通用的帧率无关插值系数
 * （Unity SmoothDamp、UE FInterpTo、游戏编程精粹均用此形式）。
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * 反向无限远投影（Reversed-Z infinite far）—— UE/Unity 现代版本的标准做法。
 * 深度精度分布反转 + 无限远平面，大幅减少远处 z-fighting。
 * 使用时需同步 depthFunc 为 GEQUAL、清除深度为 0。
 */
export function perspectiveReversedZInfinite(out: Mat4, fovyRad: number, aspect: number, near: number): Mat4 {
  const f = 1 / Math.tan(fovyRad / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = 0;        // 无限远：z 项为 0
  out[11] = -1;
  out[14] = near;     // 映射 near → 深度 0（反向）
  return out;
}

/** 正交投影（阴影贴图等平行光场景使用） */
export function orthoOffCenter(out: Mat4, left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  return ortho(out, left, right, bottom, top, near, far);
}
