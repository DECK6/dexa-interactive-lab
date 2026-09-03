import { createProgram, createTexture, FULLSCREEN_VS, uploadVideo } from '../lib/gl'
import { echoTint } from './ring'

const ECHO_COUNT = 6

const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform vec4 uTint;
uniform float uPresence;
uniform float uFeed;
uniform float uTime;
uniform int uMode;

out vec4 fragColor;

const vec3 INK = vec3(13.0, 14.0, 16.0) / 255.0;

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
  vec2 sourceUv = (uv - 0.5) * uCover + 0.5;
  vec2 mirroredUv = vec2(1.0 - sourceUv.x, sourceUv.y);
  vec3 frame = texture(uFrame, mirroredUv).rgb;

  if (uMode == 0) {
    float sweepY = fract(uTime * 0.035);
    float sweep = exp(-110.0 * abs(uv.y - sweepY));
    vec3 idleInk = INK * (0.94 + 0.06 * sweep);
    fragColor = vec4(idleInk + frame * (0.18 * uFeed), 1.0);
    return;
  }

  float mask = texture(uMask, mirroredUv).r;
  float m = smoothstep(0.35, 0.65, mask);
  float presenceMask = m * uPresence;

  if (uMode == 1) {
    float luminance = dot(frame, vec3(0.2126, 0.7152, 0.0722));
    vec3 color = mix(vec3(luminance), uTint.rgb, 0.85) * (uTint.a * presenceMask);
    fragColor = vec4(color, uTint.a * presenceMask);
    return;
  }

  fragColor = vec4(frame * presenceMask, presenceMask);
}
`

interface TextureSlot {
  frame: WebGLTexture
  mask: WebGLTexture
  maskWidth: number
  maskHeight: number
}

export interface EchoDrawState {
  liveSlot: number
  /** Six slots ordered oldest (k=6) to newest (k=1). */
  echoSlots: Int32Array
  coverX: number
  coverY: number
  presence: number
  feed: boolean
  time: number
}

export interface EchoRenderer {
  writeSlot(
    slot: number,
    video: HTMLVideoElement,
    maskData: Float32Array | null,
    maskWidth: number,
    maskHeight: number,
  ): void
  draw(state: EchoDrawState): void
  dispose(): void
}

function createMaskTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture() as WebGLTexture
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    1,
    1,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0]),
  )
  return texture
}

export function createEchoRenderer(
  gl: WebGL2RenderingContext,
  capacity: number,
): EchoRenderer {
  const program = createProgram(gl, FULLSCREEN_VS, FRAGMENT_SRC)
  const vao = gl.createVertexArray() as WebGLVertexArrayObject
  const slots = Array.from({ length: capacity }, (): TextureSlot => ({
    frame: createTexture(gl),
    mask: createMaskTexture(gl),
    maskWidth: 1,
    maskHeight: 1,
  }))
  const tints = Array.from({ length: ECHO_COUNT }, (_, i) =>
    new Float32Array(echoTint(ECHO_COUNT - i, ECHO_COUNT)),
  )

  const uResolution = gl.getUniformLocation(program, 'uResolution')
  const uCover = gl.getUniformLocation(program, 'uCover')
  const uTint = gl.getUniformLocation(program, 'uTint')
  const uPresence = gl.getUniformLocation(program, 'uPresence')
  const uFeed = gl.getUniformLocation(program, 'uFeed')
  const uTime = gl.getUniformLocation(program, 'uTime')
  const uMode = gl.getUniformLocation(program, 'uMode')

  let maskBytes = new Uint8Array(0)
  let maskWidth = 0
  let maskHeight = 0

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.useProgram(program)
  gl.bindVertexArray(vao)
  gl.uniform1i(gl.getUniformLocation(program, 'uFrame'), 0)
  gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 1)

  const bindSlot = (slot: TextureSlot): void => {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, slot.frame)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, slot.mask)
  }

  const uploadMask = (slot: TextureSlot): void => {
    if (maskBytes.length === 0) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, slot.mask)
    if (slot.maskWidth !== maskWidth || slot.maskHeight !== maskHeight) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        maskWidth,
        maskHeight,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        maskBytes,
      )
      slot.maskWidth = maskWidth
      slot.maskHeight = maskHeight
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        maskWidth,
        maskHeight,
        gl.RED,
        gl.UNSIGNED_BYTE,
        maskBytes,
      )
    }
  }

  return {
    writeSlot(
      slotIndex: number,
      video: HTMLVideoElement,
      data: Float32Array | null,
      width: number,
      height: number,
    ): void {
      const slot = slots[slotIndex]
      if (!slot) throw new RangeError(`Echo texture slot ${slotIndex} is out of range`)

      gl.activeTexture(gl.TEXTURE0)
      uploadVideo(gl, slot.frame, video)

      if (data && width > 0 && height > 0 && data.length === width * height) {
        if (maskBytes.length !== data.length) maskBytes = new Uint8Array(data.length)
        for (let i = 0; i < data.length; i++) {
          const value = data[i]
          maskBytes[i] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255)
        }
        maskWidth = width
        maskHeight = height
      }
      // A delayed segmenter result reuses the last complete mask for this frame.
      uploadMask(slot)
    },

    draw(state: EchoDrawState): void {
      const backgroundSlot = slots[state.liveSlot >= 0 ? state.liveSlot : 0]
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform2f(uCover, state.coverX, state.coverY)
      gl.uniform1f(uPresence, state.presence)
      gl.uniform1f(uFeed, state.feed && state.liveSlot >= 0 ? 1 : 0)
      gl.uniform1f(uTime, state.time)

      gl.disable(gl.BLEND)
      bindSlot(backgroundSlot)
      gl.uniform1i(uMode, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Screen blend: layers brighten toward white asymptotically instead of
      // clipping, so six overlapping echoes keep their cyan/orange hue.
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR)
      gl.uniform1i(uMode, 1)
      const echoCount = Math.min(ECHO_COUNT, state.echoSlots.length)
      for (let i = 0; i < echoCount; i++) {
        const slotIndex = state.echoSlots[i]
        if (slotIndex < 0) continue
        bindSlot(slots[slotIndex])
        gl.uniform4fv(uTint, tints[i])
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }

      if (state.liveSlot >= 0) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        bindSlot(slots[state.liveSlot])
        gl.uniform1i(uMode, 2)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
    },

    dispose(): void {
      for (const slot of slots) {
        gl.deleteTexture(slot.frame)
        gl.deleteTexture(slot.mask)
      }
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    },
  }
}
