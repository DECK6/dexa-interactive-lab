// 02 FINGER FRAME — the quad drawn by two hands is a live viewport: whatever
// falls inside it is re-rendered by one of eight GLSL effects, and twisting the
// frame cycles them.
import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { createHandTracker } from '../lib/tracking/hands'
import { createHud, showCameraError } from '../lib/hud'
import { OneEuroFilter } from '../lib/math/one-euro'
import { TwistDetector } from '../lib/math/twist'
import { EFFECTS, FRAG_SRC } from './effects'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

// Fullscreen triangle — no attributes, positions come from gl_VertexID.
const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const shader = gl.createShader(type) as WebGLShader
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`)
    }
    return shader
  }

  const program = gl.createProgram() as WebGLProgram
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SRC))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SRC))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

async function main(): Promise<void> {
  const hud = createHud({
    title: '02 FINGER FRAME',
    sub: 'GESTURE-MASKED',
    hint: '양손 엄지와 검지로 사각형을 만들어 보세요 · 비틀면 이펙트 전환',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createHandTracker(video)
  addEventListener('pagehide', () => {
    tracker.dispose()
    stopCamera(video)
  })

  const gl = canvas.getContext('webgl2')
  if (!gl) {
    console.error('[fingerframe] WebGL2 is not available')
    return
  }

  const resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(innerWidth * dpr)
    canvas.height = Math.round(innerHeight * dpr)
  }
  resize()
  addEventListener('resize', resize)

  const program = buildProgram(gl)
  gl.useProgram(program)
  gl.bindVertexArray(gl.createVertexArray())

  const uResolution = gl.getUniformLocation(program, 'uResolution')
  const uCover = gl.getUniformLocation(program, 'uCover')
  const uCorners = gl.getUniformLocation(program, 'uCorners')
  const uTime = gl.getUniformLocation(program, 'uTime')
  const uHasFrame = gl.getUniformLocation(program, 'uHasFrame')
  const uEffect = gl.getUniformLocation(program, 'uEffect')

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  // Ink placeholder so the first frames sample a complete texture.
  const ink = new Uint8Array([13, 14, 16, 255])
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ink)
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0)

  // Corners live in video-normalized space until they are handed to the shader.
  // Rest pose keeps the fade-in centred before any hands appear.
  const corners = [
    { x: 0.36, y: 0.3 },
    { x: 0.64, y: 0.3 },
    { x: 0.64, y: 0.7 },
    { x: 0.36, y: 0.7 },
  ]
  const filters = Array.from({ length: 8 }, () => new OneEuroFilter(1.0, 0.7))
  const cornerBuf = new Float32Array(8)

  const twist = new TwistDetector()
  const t0 = performance.now()
  let effect = 0
  let last = t0
  let fps = 60
  let hasFrame = 0
  let wasPresent = false

  const loop = (): void => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const frame = tracker.read()
    if (frame.present && frame.corners) {
      // Hands that just reappeared are somewhere new — snap instead of sliding.
      if (!wasPresent) for (const f of filters) f.reset()
      frame.corners.forEach((c, i) => {
        corners[i].x = filters[i * 2].filter(c.x, now / 1000)
        corners[i].y = filters[i * 2 + 1].filter(c.y, now / 1000)
      })
    }
    wasPresent = frame.present
    hasFrame += ((frame.present ? 1 : 0) - hasFrame) * (1 - Math.exp(-dt * 6))

    const dir = frame.present ? twist.update(frame.roll, now) : 0
    if (dir !== 0) {
      effect = (effect + dir + EFFECTS.length) % EFFECTS.length
      hud.flash(`0${effect + 1} / ${EFFECTS[effect].name}`)
    }

    // Cover crop: the video fills the viewport, uCover is the visible fraction.
    const videoAspect = video.videoWidth / video.videoHeight
    const canvasAspect = canvas.width / canvas.height
    const coverX = canvasAspect > videoAspect ? 1 : canvasAspect / videoAspect
    const coverY = canvasAspect > videoAspect ? videoAspect / canvasAspect : 1

    // Losing the hands shrinks the frame toward its own centroid as it fades.
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
    const shrink = 0.3 + 0.7 * hasFrame
    for (let i = 0; i < 4; i++) {
      cornerBuf[i * 2] = (cx + (corners[i].x - cx) * shrink - 0.5) / coverX + 0.5
      cornerBuf[i * 2 + 1] = (cy + (corners[i].y - cy) * shrink - 0.5) / coverY + 0.5
    }

    if (video.readyState >= 2) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uResolution, canvas.width, canvas.height)
    gl.uniform2f(uCover, coverX, coverY)
    gl.uniform2fv(uCorners, cornerBuf)
    gl.uniform1f(uTime, (now - t0) / 1000)
    gl.uniform1f(uHasFrame, hasFrame)
    gl.uniform1i(uEffect, effect)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    hud.setTracking(frame.present)
    hud.setFps(fps)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

void main()
