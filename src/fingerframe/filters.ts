import { FRAG_SRC } from './effects'
import type { Quad } from '../lib/math/quad'

/** The original twelve GLSL materials, with a reusable source and explicit cleanup. */
export function createFilterRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2를 사용할 수 없습니다.')
  const shaders: WebGLShader[] = []
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error')
    shaders.push(shader)
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
void main() { vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SRC))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Link error')
  gl.useProgram(program)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const u = Object.fromEntries(['uTex', 'uResolution', 'uCover', 'uCorners', 'uTime', 'uHasFrame', 'uEffect'].map(name => [name, gl.getUniformLocation(program, name)]))
  gl.uniform1i(u.uTex, 0)
  const corners = new Float32Array(8)
  return {
    render(source: HTMLCanvasElement, quad: Quad, strength: number, effect: number, time: number) {
      const dpr = Math.min(devicePixelRatio, 1.5)
      const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      // The shared source is already displayed/mirrored. Undo shader's original x mirror.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      quad.forEach((p, i) => { corners[i * 2] = p.x; corners[i * 2 + 1] = p.y })
      gl.viewport(0, 0, w, h)
      gl.uniform2f(u.uResolution, w, h)
      gl.uniform2f(u.uCover, -1, 1)
      gl.uniform2fv(u.uCorners, corners)
      gl.uniform1f(u.uTime, time)
      gl.uniform1f(u.uHasFrame, strength)
      gl.uniform1i(u.uEffect, effect)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteTexture(texture)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      shaders.forEach(shader => gl.deleteShader(shader))
    },
  }
}
