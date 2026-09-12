// 渲染目标（MRT 颜色+法线 + 深度纹理），用于后处理场景
type GL = WebGL2RenderingContext;

export class RenderTarget {
  fbo: WebGLFramebuffer;
  colorTex: WebGLTexture;
  normalTex: WebGLTexture;
  depthTex: WebGLTexture;
  width = 0;
  height = 0;
  private gl: GL;
  private hasMRT: boolean;
  private mips: boolean;

  constructor(gl: GL, hasMRT: boolean, mips = false) {
    this.gl = gl;
    this.hasMRT = hasMRT;
    this.mips = mips;
    this.fbo = gl.createFramebuffer()!;
    this.colorTex = gl.createTexture()!;
    this.normalTex = gl.createTexture()!;
    this.depthTex = gl.createTexture()!;
  }

  resize(w: number, h: number) {
    if (this.width === w && this.height === h) return;
    const gl = this.gl;
    this.width = w; this.height = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);

    const setupTex = (tex: WebGLTexture, internal: number, format: number, type: number, depth = false) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      // 深度纹理只支持 NEAREST
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, depth ? gl.NEAREST : this.mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, depth ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.mips && !depth) gl.generateMipmap(gl.TEXTURE_2D);
    };

    setupTex(this.colorTex, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    // 法线缓冲：优先半浮点
    const floatOK = gl.getExtension('EXT_color_buffer_float') !== null;
    if (this.hasMRT && floatOK) setupTex(this.normalTex, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    else setupTex(this.normalTex, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    setupTex(this.depthTex, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, true);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTex, 0);
    if (this.hasMRT) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.normalTex, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('[RenderTarget] framebuffer incomplete: 0x' + status.toString(16));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo);
  }

  bindTexture(tex: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  generateMips() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.colorTex);
    gl.deleteTexture(this.normalTex);
    gl.deleteTexture(this.depthTex);
  }
}
