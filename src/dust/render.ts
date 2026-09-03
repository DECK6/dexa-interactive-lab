import { createProgram, createTexture, FULLSCREEN_VS, uploadVideo } from '../lib/gl'
import type { BBox, DustState } from './particles'

const PARTICLE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aHome;
layout(location = 2) in float aScatter;

uniform sampler2D uVideo;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform vec4 uBBox;
uniform float uDpr;
uniform float uPresence;

out vec3 vColor;
out float vScatter;
out float vPresence;

void main() {
  vec2 clip = aPosition / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  vec2 homePx = uBBox.xy + aHome * uBBox.zw;
  vec2 screenUv = homePx / uResolution;
  vec2 videoUv = screenUv * uCover + (1.0 - uCover) * 0.5;
  videoUv.x = 1.0 - videoUv.x;
  vec3 liveColor = texture(uVideo, clamp(videoUv, 0.0, 1.0)).rgb;
  vec3 cyan = vec3(0.368627, 0.905882, 0.952941);
  vColor = mix(liveColor, cyan, clamp(aScatter * 0.8, 0.0, 0.8));
  vScatter = aScatter;
  vPresence = uPresence;
  gl_PointSize = (3.0 + aScatter * 1.5) * uDpr;
}
`

const PARTICLE_FS = `#version 300 es
precision highp float;

in vec3 vColor;
in float vScatter;
in float vPresence;
out vec4 outColor;

void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  if (radius >= 1.0) discard;
  float soft = 1.0 - smoothstep(0.12, 1.0, radius);
  float core = 1.0 - smoothstep(0.0, 0.32, radius);
  vec3 white = vec3(0.968627, 0.980392, 0.988235);
  vec3 lit = mix(vColor, white, core * 0.22);
  // Bright enough that the assembled face reads as a face; scattered sparks
  // are sparser so they can afford to be a little dimmer.
  float energy = (1.15 - vScatter * 0.25) * (0.58 + vPresence * 0.42);
  outColor = vec4(lit * soft * energy, soft);
}
`

const BACKGROUND_FS = `#version 300 es
precision highp float;

uniform sampler2D uVideo;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform float uDpr;
uniform float uTime;
uniform bool uShowVideo;
out vec4 outColor;

void main() {
  vec3 ink = vec3(0.050980, 0.054902, 0.062745);
  vec3 key = vec3(0.164706, 0.168627, 0.180392);
  vec2 screenUv = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
  vec2 videoUv = screenUv * uCover + (1.0 - uCover) * 0.5;
  videoUv.x = 1.0 - videoUv.x;
  vec3 color = ink;
  if (uShowVideo) color = mix(ink, texture(uVideo, clamp(videoUv, 0.0, 1.0)).rgb, 0.12);

  float spacing = 40.0 * uDpr;
  vec2 drift = vec2(uTime * 2.4, uTime * -1.6) * uDpr;
  vec2 gridCell = mod(gl_FragCoord.xy + drift, spacing) - spacing * 0.5;
  float dot = 1.0 - smoothstep(0.3 * uDpr, 1.1 * uDpr, length(gridCell));
  float breathe = 0.32 + 0.10 * sin(uTime * 0.8);
  color = mix(color, key, dot * breathe);
  outColor = vec4(color, 1.0);
}
`

export interface DustRenderFrame {
  coverX: number
  coverY: number
  dpr: number
  time: number
  presence: number
  showVideo: boolean
}

export interface DustRenderer {
  render(video: HTMLVideoElement, state: DustState, bbox: BBox | null, frame: DustRenderFrame): void
  dispose(): void
}

export function createDustRenderer(gl: WebGL2RenderingContext): DustRenderer {
  const particleProgram = createProgram(gl, PARTICLE_VS, PARTICLE_FS)
  const backgroundProgram = createProgram(gl, FULLSCREEN_VS, BACKGROUND_FS)
  const videoTexture = createTexture(gl, { filter: 'linear', wrap: 'clamp' })
  const particleVao = gl.createVertexArray() as WebGLVertexArrayObject
  const backgroundVao = gl.createVertexArray() as WebGLVertexArrayObject
  const posBuffer = gl.createBuffer() as WebGLBuffer
  const homeBuffer = gl.createBuffer() as WebGLBuffer
  const scatterBuffer = gl.createBuffer() as WebGLBuffer

  gl.bindVertexArray(particleVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, homeBuffer)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, scatterBuffer)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0)

  gl.useProgram(particleProgram)
  gl.uniform1i(gl.getUniformLocation(particleProgram, 'uVideo'), 0)
  gl.useProgram(backgroundProgram)
  gl.uniform1i(gl.getUniformLocation(backgroundProgram, 'uVideo'), 0)

  const particleResolution = gl.getUniformLocation(particleProgram, 'uResolution')
  const particleCover = gl.getUniformLocation(particleProgram, 'uCover')
  const particleBBox = gl.getUniformLocation(particleProgram, 'uBBox')
  const particleDpr = gl.getUniformLocation(particleProgram, 'uDpr')
  const particlePresence = gl.getUniformLocation(particleProgram, 'uPresence')
  const backgroundResolution = gl.getUniformLocation(backgroundProgram, 'uResolution')
  const backgroundCover = gl.getUniformLocation(backgroundProgram, 'uCover')
  const backgroundDpr = gl.getUniformLocation(backgroundProgram, 'uDpr')
  const backgroundTime = gl.getUniformLocation(backgroundProgram, 'uTime')
  const backgroundShowVideo = gl.getUniformLocation(backgroundProgram, 'uShowVideo')
  let bufferCount = -1

  const allocateBuffers = (state: DustState): void => {
    if (bufferCount === state.n) return
    bufferCount = state.n
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, state.pos.byteLength, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, homeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, state.home.byteLength, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, scatterBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, state.scatter.byteLength, gl.DYNAMIC_DRAW)
  }

  return {
    render(video: HTMLVideoElement, state: DustState, bbox: BBox | null, frame: DustRenderFrame): void {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.clearColor(0.050980, 0.054902, 0.062745, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.activeTexture(gl.TEXTURE0)
      uploadVideo(gl, videoTexture, video)

      gl.disable(gl.BLEND)
      gl.useProgram(backgroundProgram)
      gl.bindVertexArray(backgroundVao)
      gl.uniform2f(backgroundResolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform2f(backgroundCover, frame.coverX, frame.coverY)
      gl.uniform1f(backgroundDpr, frame.dpr)
      gl.uniform1f(backgroundTime, frame.time)
      gl.uniform1i(backgroundShowVideo, frame.showVideo ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!state.seeded || !bbox) return
      allocateBuffers(state)
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.pos)
      gl.bindBuffer(gl.ARRAY_BUFFER, homeBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.home)
      gl.bindBuffer(gl.ARRAY_BUFFER, scatterBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.scatter)

      gl.useProgram(particleProgram)
      gl.bindVertexArray(particleVao)
      gl.uniform2f(particleResolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform2f(particleCover, frame.coverX, frame.coverY)
      gl.uniform4f(particleBBox, bbox.x, bbox.y, bbox.w, bbox.h)
      gl.uniform1f(particleDpr, frame.dpr)
      gl.uniform1f(particlePresence, frame.presence)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.drawArrays(gl.POINTS, 0, state.n)
      gl.disable(gl.BLEND)
    },
    dispose(): void {
      gl.deleteBuffer(posBuffer)
      gl.deleteBuffer(homeBuffer)
      gl.deleteBuffer(scatterBuffer)
      gl.deleteVertexArray(particleVao)
      gl.deleteVertexArray(backgroundVao)
      gl.deleteTexture(videoTexture)
      gl.deleteProgram(particleProgram)
      gl.deleteProgram(backgroundProgram)
    },
  }
}
