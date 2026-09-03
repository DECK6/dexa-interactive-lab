// Small WebGL2 helpers shared by the raw-GL experiences.

/** Fullscreen triangle — no attributes, positions come from gl_VertexID. Draw with gl.drawArrays(TRIANGLES, 0, 3). */
export const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const shader = gl.createShader(type) as WebGLShader
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}\n${src}`)
    }
    return shader
  }
  const program = gl.createProgram() as WebGLProgram
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vs))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

export interface TextureOpts {
  filter?: 'linear' | 'nearest'
  wrap?: 'clamp' | 'repeat'
}

/** RGBA8 texture seeded with a 1×1 ink pixel so it is complete before the first upload. */
export function createTexture(gl: WebGL2RenderingContext, opts: TextureOpts = {}): WebGLTexture {
  const tex = gl.createTexture() as WebGLTexture
  const filter = opts.filter === 'nearest' ? gl.NEAREST : gl.LINEAR
  const wrap = opts.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([13, 14, 16, 255]))
  return tex
}

/** Uploads the current video frame into `tex` (binds it to TEXTURE_2D as a side effect). */
export function uploadVideo(gl: WebGL2RenderingContext, tex: WebGLTexture, video: HTMLVideoElement): void {
  if (video.readyState < 2) return
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
}
