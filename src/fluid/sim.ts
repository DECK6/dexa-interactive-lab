import { createProgram, FULLSCREEN_VS } from '../lib/gl'
import type { Emitter } from './emitters'
import {
  ADVECTION_FS,
  CURL_FS,
  DISPLAY_FS,
  DIVERGENCE_FS,
  GRADIENT_SUBTRACT_FS,
  PRESSURE_FS,
  SPLAT_FS,
  VORTICITY_FS,
} from './shaders'

export interface FluidOpts {
  simRes: number
  dyeRes: number
}

export interface Fluid {
  resize(canvasW: number, canvasH: number): void
  step(dt: number, emitters: Emitter[]): void
  /** Composites dye over the optional dimmed video frame into the default framebuffer. */
  render(video: WebGLTexture | null, videoDim: number, coverX: number, coverY: number): void
  clear(): void
}

interface Surface {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
}

interface DoubleSurface {
  read: Surface
  write: Surface
  swap(): void
}

interface Pass {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

const MAX_EMITTERS = 10
const PRESSURE_ITERATIONS = 20
const VORTICITY_STRENGTH = 30

export function createFluid(gl: WebGL2RenderingContext, opts: FluidOpts): Fluid {
  const useFloat = Boolean(gl.getExtension('EXT_color_buffer_float'))
  const floatLinear = useFloat && Boolean(gl.getExtension('OES_texture_float_linear'))
  const lowPrecision = !useFloat
  const manualFilter = useFloat && !floatLinear
  const internalFormat = useFloat ? gl.RGBA16F : gl.RGBA8
  const dataType = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
  const textureFilter = manualFilter ? gl.NEAREST : gl.LINEAR
  const vao = gl.createVertexArray() as WebGLVertexArrayObject
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number

  const curlPass = makePass(CURL_FS, ['uVelocity', 'uTexelSize'])
  const vorticityPass = makePass(VORTICITY_FS, [
    'uVelocity',
    'uCurl',
    'uTexelSize',
    'uDt',
    'uStrength',
  ])
  const divergencePass = makePass(DIVERGENCE_FS, ['uVelocity', 'uTexelSize'])
  const pressurePass = makePass(PRESSURE_FS, ['uPressure', 'uDivergence', 'uTexelSize'])
  const gradientPass = makePass(GRADIENT_SUBTRACT_FS, ['uPressure', 'uVelocity', 'uTexelSize'])
  const advectionPass = makePass(ADVECTION_FS, [
    'uVelocity',
    'uSource',
    'uTexelSize',
    'uVelocityToUv',
    'uDt',
    'uDissipation',
    'uManualFilter',
    'uSourceEncoded',
    'uTargetEncoded',
  ])
  const splatPass = makePass(SPLAT_FS, [
    'uTarget',
    'uTexelSize',
    'uAspect',
    'uPoints[0]',
    'uVelocities[0]',
    'uColors[0]',
    'uRadii[0]',
    'uIntensities[0]',
    'uBursts[0]',
    'uCount',
    'uKind',
  ])
  const displayPass = makePass(DISPLAY_FS, [
    'uDye',
    'uVideo',
    'uResolution',
    'uCover',
    'uVideoDim',
    'uHasVideo',
    'uManualFilter',
  ])

  const points = new Float32Array(MAX_EMITTERS * 2)
  const velocities = new Float32Array(MAX_EMITTERS * 2)
  const colors = new Float32Array(MAX_EMITTERS * 3)
  const radii = new Float32Array(MAX_EMITTERS)
  const intensities = new Float32Array(MAX_EMITTERS)
  const bursts = new Float32Array(MAX_EMITTERS)

  let canvasWidth = 0
  let canvasHeight = 0
  let allocated: Surface[] = []
  let velocity: DoubleSurface | null = null
  let dye: DoubleSurface | null = null
  let pressure: DoubleSurface | null = null
  let divergence: Surface | null = null
  let curl: Surface | null = null

  gl.disable(gl.BLEND)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)

  function makePass(fragment: string, names: string[]): Pass {
    const source = lowPrecision ? defineLowPrecision(fragment) : fragment
    const program = createProgram(gl, FULLSCREEN_VS, source)
    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    for (const name of names) uniforms[name] = gl.getUniformLocation(program, name)
    return { program, uniforms }
  }

  function makeSurface(width: number, height: number): Surface {
    const texture = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, dataType, null)

    const fbo = gl.createFramebuffer() as WebGLFramebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('[fluid] framebuffer is incomplete')
    }
    const surface = { texture, fbo, width, height }
    allocated.push(surface)
    return surface
  }

  function makeDouble(width: number, height: number): DoubleSurface {
    const pair: DoubleSurface = {
      read: makeSurface(width, height),
      write: makeSurface(width, height),
      swap(): void {
        const current = pair.read
        pair.read = pair.write
        pair.write = current
      },
    }
    return pair
  }

  function begin(pass: Pass, target: Surface | null, width?: number, height?: number): void {
    gl.useProgram(pass.program)
    gl.bindVertexArray(vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null)
    gl.viewport(0, 0, target?.width ?? width ?? canvasWidth, target?.height ?? height ?? canvasHeight)
  }

  function draw(): void {
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  function bind(pass: Pass, name: string, unit: number, texture: WebGLTexture | null): void {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(pass.uniforms[name], unit)
  }

  function texel(pass: Pass, surface: Surface): void {
    gl.uniform2f(pass.uniforms.uTexelSize, 1 / surface.width, 1 / surface.height)
  }

  function clearSurface(surface: Surface, encoded: boolean, isDye = false): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.fbo)
    gl.viewport(0, 0, surface.width, surface.height)
    const zero = encoded && !isDye ? 128 / 255 : 0
    gl.clearColor(zero, zero, zero, isDye ? 0 : 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  function clearAll(): void {
    if (!velocity || !dye || !pressure || !divergence || !curl) return
    clearSurface(velocity.read, lowPrecision)
    clearSurface(velocity.write, lowPrecision)
    clearSurface(pressure.read, lowPrecision)
    clearSurface(pressure.write, lowPrecision)
    clearSurface(divergence, lowPrecision)
    clearSurface(curl, lowPrecision)
    clearSurface(dye.read, false, true)
    clearSurface(dye.write, false, true)
  }

  function destroySurfaces(): void {
    for (const surface of allocated) {
      gl.deleteFramebuffer(surface.fbo)
      gl.deleteTexture(surface.texture)
    }
    allocated = []
  }

  function resize(canvasW: number, canvasH: number): void {
    const nextW = Math.max(1, Math.round(canvasW))
    const nextH = Math.max(1, Math.round(canvasH))
    const simSize = resolutionFor(Math.max(1, opts.simRes), nextW, nextH, maxTextureSize)
    const dyeShort = Math.max(1, Math.min(opts.dyeRes, Math.min(nextW, nextH)))
    const dyeSize = resolutionFor(dyeShort, nextW, nextH, maxTextureSize)
    if (
      velocity?.read.width === simSize.width &&
      velocity.read.height === simSize.height &&
      dye?.read.width === dyeSize.width &&
      dye.read.height === dyeSize.height
    ) {
      canvasWidth = nextW
      canvasHeight = nextH
      return
    }

    destroySurfaces()
    canvasWidth = nextW
    canvasHeight = nextH
    velocity = makeDouble(simSize.width, simSize.height)
    pressure = makeDouble(simSize.width, simSize.height)
    divergence = makeSurface(simSize.width, simSize.height)
    curl = makeSurface(simSize.width, simSize.height)
    dye = makeDouble(dyeSize.width, dyeSize.height)
    clearAll()
  }

  function step(dt: number, emitters: Emitter[]): void {
    if (!velocity || !dye || !pressure || !divergence || !curl) return
    const frameDt = Math.min(Math.max(dt, 0), 0.1)

    begin(curlPass, curl)
    bind(curlPass, 'uVelocity', 0, velocity.read.texture)
    texel(curlPass, velocity.read)
    draw()

    begin(vorticityPass, velocity.write)
    bind(vorticityPass, 'uVelocity', 0, velocity.read.texture)
    bind(vorticityPass, 'uCurl', 1, curl.texture)
    texel(vorticityPass, velocity.read)
    gl.uniform1f(vorticityPass.uniforms.uDt, frameDt)
    gl.uniform1f(vorticityPass.uniforms.uStrength, VORTICITY_STRENGTH)
    draw()
    velocity.swap()

    begin(divergencePass, divergence)
    bind(divergencePass, 'uVelocity', 0, velocity.read.texture)
    texel(divergencePass, velocity.read)
    draw()

    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      begin(pressurePass, pressure.write)
      bind(pressurePass, 'uPressure', 0, pressure.read.texture)
      bind(pressurePass, 'uDivergence', 1, divergence.texture)
      texel(pressurePass, pressure.read)
      draw()
      pressure.swap()
    }

    begin(gradientPass, velocity.write)
    bind(gradientPass, 'uPressure', 0, pressure.read.texture)
    bind(gradientPass, 'uVelocity', 1, velocity.read.texture)
    texel(gradientPass, velocity.read)
    draw()
    velocity.swap()

    begin(advectionPass, velocity.write)
    bind(advectionPass, 'uVelocity', 0, velocity.read.texture)
    bind(advectionPass, 'uSource', 1, velocity.read.texture)
    texel(advectionPass, velocity.write)
    gl.uniform2f(
      advectionPass.uniforms.uVelocityToUv,
      Math.min(canvasWidth, canvasHeight) / canvasWidth,
      Math.min(canvasWidth, canvasHeight) / canvasHeight,
    )
    gl.uniform1f(advectionPass.uniforms.uDt, frameDt)
    gl.uniform1f(advectionPass.uniforms.uDissipation, 0.2)
    gl.uniform1i(advectionPass.uniforms.uManualFilter, manualFilter ? 1 : 0)
    gl.uniform1i(advectionPass.uniforms.uSourceEncoded, lowPrecision ? 1 : 0)
    gl.uniform1i(advectionPass.uniforms.uTargetEncoded, lowPrecision ? 1 : 0)
    draw()
    velocity.swap()

    begin(advectionPass, dye.write)
    bind(advectionPass, 'uVelocity', 0, velocity.read.texture)
    bind(advectionPass, 'uSource', 1, dye.read.texture)
    texel(advectionPass, dye.write)
    gl.uniform2f(
      advectionPass.uniforms.uVelocityToUv,
      Math.min(canvasWidth, canvasHeight) / canvasWidth,
      Math.min(canvasWidth, canvasHeight) / canvasHeight,
    )
    gl.uniform1f(advectionPass.uniforms.uDt, frameDt)
    gl.uniform1f(advectionPass.uniforms.uDissipation, 1)
    gl.uniform1i(advectionPass.uniforms.uManualFilter, manualFilter ? 1 : 0)
    gl.uniform1i(advectionPass.uniforms.uSourceEncoded, 0)
    gl.uniform1i(advectionPass.uniforms.uTargetEncoded, 0)
    draw()
    dye.swap()

    if (emitters.length) {
      applySplats(velocity, emitters, 0)
      applySplats(dye, emitters, 1)
    }
  }

  function applySplats(target: DoubleSurface, emitters: Emitter[], kind: 0 | 1): void {
    const shortSide = Math.min(target.read.width, target.read.height)
    const aspectX = target.read.width / shortSide
    const aspectY = target.read.height / shortSide
    let count = 0
    for (let i = 0; i < emitters.length && count < MAX_EMITTERS; i++) {
      const emitter = emitters[i]
      if (
        !Number.isFinite(emitter.x) ||
        !Number.isFinite(emitter.y) ||
        !Number.isFinite(emitter.dx) ||
        !Number.isFinite(emitter.dy) ||
        emitter.radius <= 0
      ) continue
      const velocityX = emitter.dx * aspectX
      const velocityY = -emitter.dy * aspectY
      const speed = Math.hypot(velocityX, velocityY)
      points[count * 2] = emitter.x
      points[count * 2 + 1] = 1 - emitter.y
      velocities[count * 2] = Math.max(-3, Math.min(3, velocityX))
      velocities[count * 2 + 1] = Math.max(-3, Math.min(3, velocityY))
      colors[count * 3] = emitter.color[0]
      colors[count * 3 + 1] = emitter.color[1]
      colors[count * 3 + 2] = emitter.color[2]
      radii[count] = emitter.radius
      intensities[count] = kind === 0
        ? 0.18 + Math.min(speed, 2.5) * 0.42
        : 0.045 + Math.min(speed, 2.5) * 0.16 + (emitter.burst ? 0.65 : 0)
      bursts[count] = emitter.burst ? 1 : 0
      count++
    }
    if (!count) return

    begin(splatPass, target.write)
    bind(splatPass, 'uTarget', 0, target.read.texture)
    texel(splatPass, target.write)
    gl.uniform2f(
      splatPass.uniforms.uAspect,
      aspectX,
      aspectY,
    )
    gl.uniform2fv(splatPass.uniforms['uPoints[0]'], points)
    gl.uniform2fv(splatPass.uniforms['uVelocities[0]'], velocities)
    gl.uniform3fv(splatPass.uniforms['uColors[0]'], colors)
    gl.uniform1fv(splatPass.uniforms['uRadii[0]'], radii)
    gl.uniform1fv(splatPass.uniforms['uIntensities[0]'], intensities)
    gl.uniform1fv(splatPass.uniforms['uBursts[0]'], bursts)
    gl.uniform1i(splatPass.uniforms.uCount, count)
    gl.uniform1i(splatPass.uniforms.uKind, kind)
    draw()
    target.swap()
  }

  function render(
    video: WebGLTexture | null,
    videoDim: number,
    coverX: number,
    coverY: number,
  ): void {
    if (!dye) return
    begin(displayPass, null, canvasWidth, canvasHeight)
    bind(displayPass, 'uVideo', 0, video)
    bind(displayPass, 'uDye', 1, dye.read.texture)
    gl.uniform2f(displayPass.uniforms.uResolution, canvasWidth, canvasHeight)
    gl.uniform2f(displayPass.uniforms.uCover, coverX, coverY)
    gl.uniform1f(displayPass.uniforms.uVideoDim, videoDim)
    gl.uniform1i(displayPass.uniforms.uHasVideo, video ? 1 : 0)
    gl.uniform1i(displayPass.uniforms.uManualFilter, manualFilter ? 1 : 0)
    draw()
  }

  return { resize, step, render, clear: clearAll }
}

function defineLowPrecision(source: string): string {
  const lineEnd = source.indexOf('\n')
  return `${source.slice(0, lineEnd + 1)}#define LOW_PRECISION\n${source.slice(lineEnd + 1)}`
}

function resolutionFor(
  shortSide: number,
  canvasWidth: number,
  canvasHeight: number,
  maxTextureSize: number,
): { width: number; height: number } {
  const aspect = canvasWidth / canvasHeight
  let width = aspect >= 1 ? Math.round(shortSide * aspect) : Math.round(shortSide)
  let height = aspect >= 1 ? Math.round(shortSide) : Math.round(shortSide / aspect)
  const longest = Math.max(width, height)
  if (longest > maxTextureSize) {
    const scale = maxTextureSize / longest
    width = Math.max(1, Math.floor(width * scale))
    height = Math.max(1, Math.floor(height * scale))
  }
  return { width: Math.max(1, width), height: Math.max(1, height) }
}
