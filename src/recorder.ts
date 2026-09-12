// 录制器：canvas.captureStream + MediaRecorder（webm / mp4 自动选择）
import { LogBus } from './logs';

export class CanvasRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  startAt = 0;

  static supportedMimes(): string[] {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ];
    return candidates.filter((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  }

  start(canvas: HTMLCanvasElement, fps = 60, bitrate = 12_000_000, mime?: string) {
    if (this.rec) return;
    const mimes = CanvasRecorder.supportedMimes();
    const chosen = mime && mimes.includes(mime) ? mime : mimes[0];
    if (!chosen) throw new Error('当前环境不支持 MediaRecorder 录制');
    this.stream = canvas.captureStream(fps);
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, { mimeType: chosen, videoBitsPerSecond: bitrate });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.startAt = performance.now();
    this.rec.start(200);
    LogBus.ok('录制', `开始录制视口画面（${chosen.split(';')[0]} · ${fps}fps · ${(bitrate / 1e6).toFixed(0)}Mbps）`);
  }

  async stop(): Promise<{ blob: Blob; seconds: number; mime: string } | null> {
    if (!this.rec) return null;
    const rec = this.rec;
    const seconds = (performance.now() - this.startAt) / 1000;
    const mime = rec.mimeType;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: mime.split(';')[0] });
        this.stream?.getTracks().forEach((t) => t.stop());
        this.rec = null;
        this.stream = null;
        resolve({ blob, seconds, mime });
      };
      rec.stop();
    });
  }

  get recording() {
    return this.rec !== null;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadDataURL(dataURL: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  a.click();
}

export function timestampName(prefix: string, ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
