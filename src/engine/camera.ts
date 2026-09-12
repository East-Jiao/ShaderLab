// 轨道相机（左键拖拽旋转 / 滚轮缩放）
// 手感采用业界标准的指数阻尼：输入写入 target 值，实际值按 1-exp(-λ·dt)
// 帧率无关地逼近目标（参考 Unity 场景视图 / Blender 轨道相机的平滑感）。
import { M4, lookAt, perspective, multiply, type Mat4, type Vec3, clamp, damp } from './math';

const DAMP = 14; // 阻尼系数 λ：越大越"跟手"

export class OrbitCamera {
  yaw = 0.6;
  pitch = 0.42;
  dist = 5.2;
  target: Vec3 = [0, 0, 0];
  fov = 50; // 度
  autoRotate = false;
  autoRotateSpeed = 0.25;
  near = 0.1;
  far = 100;

  // 阻尼目标值
  private tYaw = this.yaw;
  private tPitch = this.pitch;
  private tDist = this.dist;

  view: Mat4 = M4();
  projection: Mat4 = M4();
  viewProj: Mat4 = M4();
  eye: Vec3 = [0, 0, 5];

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  attach(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach(canvas: HTMLCanvasElement) {
    canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('wheel', this.onWheel);
  }

  /** 外部直接设定视角（预设加载时调用）：同时写入当前值与目标值，避免加载时漂移 */
  setAngles(yaw?: number, pitch?: number, dist?: number) {
    if (yaw !== undefined) this.yaw = this.tYaw = yaw;
    if (pitch !== undefined) this.pitch = this.tPitch = clamp(pitch, -1.45, 1.45);
    if (dist !== undefined) this.dist = this.tDist = clamp(dist, 1.2, 40);
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.tYaw -= dx * 0.008;
    this.tPitch = clamp(this.tPitch + dy * 0.008, -1.45, 1.45);
  };
  private onUp = () => { this.dragging = false; };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.tDist = clamp(this.tDist * Math.exp(e.deltaY * 0.001), 1.2, 40);
  };

  update(dt: number) {
    if (this.autoRotate && !this.dragging) this.tYaw += this.autoRotateSpeed * dt;
    // 指数阻尼逼近目标（帧率无关）
    this.yaw = damp(this.yaw, this.tYaw, DAMP, dt);
    this.pitch = damp(this.pitch, this.tPitch, DAMP, dt);
    this.dist = damp(this.dist, this.tDist, DAMP, dt);
    const cp = Math.cos(this.pitch);
    this.eye = [
      this.target[0] + this.dist * cp * Math.sin(this.yaw),
      this.target[1] + this.dist * Math.sin(this.pitch),
      this.target[2] + this.dist * cp * Math.cos(this.yaw),
    ];
    lookAt(this.view, this.eye, this.target, [0, 1, 0]);
  }

  setAspect(aspect: number) {
    perspective(this.projection, (this.fov * Math.PI) / 180, aspect, this.near, this.far);
    multiply(this.viewProj, this.projection, this.view);
  }

  /** 全屏 raymarch 用的相机基（列 = right / up / forward） */
  basis(out: Float32Array) {
    const f: Vec3 = [
      this.target[0] - this.eye[0],
      this.target[1] - this.eye[1],
      this.target[2] - this.eye[2],
    ];
    const fl = Math.hypot(...f) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    let r: Vec3 = [f[2], 0, -f[0]];
    const rl = Math.hypot(...r) || 1;
    r = [r[0] / rl, r[1] / rl, r[2] / rl];
    const u: Vec3 = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    // mat3 列主序
    out[0] = r[0]; out[1] = r[1]; out[2] = r[2];
    out[3] = u[0]; out[4] = u[1]; out[5] = u[2];
    out[6] = f[0]; out[7] = f[1]; out[8] = f[2];
    return out;
  }
}
