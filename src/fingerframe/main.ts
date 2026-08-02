// STUB — B2b replaces the render body with the WebGL2 masked-shader pipeline.
// Wiring (camera → tracker → twist → HUD → rAF) and the failure path are final.
import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { createHandTracker } from '../lib/tracking/hands'
import { createHud, showCameraError } from '../lib/hud'
import { TwistDetector } from '../lib/math/twist'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

async function main(): Promise<void> {
  const hud = createHud({
    title: '02 FINGER FRAME',
    sub: 'GESTURE-MASKED',
    hint: '양손 엄지와 검지로 사각형을 만들어 보세요 · 비틀면 이펙트 전환',
  })
  document.body.append(hud.el)

  const debug = document.createElement('div')
  debug.className = 'hud-chip hud-debug'
  hud.el.append(debug)

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

  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
  const resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(innerWidth * dpr)
    canvas.height = Math.round(innerHeight * dpr)
  }
  resize()
  addEventListener('resize', resize)

  const twist = new TwistDetector()
  let effect = 0
  let last = performance.now()
  let fps = 60

  const loop = (): void => {
    const now = performance.now()
    fps += (1000 / Math.max(now - last, 1) - fps) * 0.1
    last = now

    const frame = tracker.read()
    const dir = frame.present ? twist.update(frame.roll, now) : 0
    if (dir !== 0) {
      effect = (effect + dir + 8) % 8
      hud.flash(`0${effect + 1} / EFFECT`)
    }

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.051, 0.055, 0.063, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    hud.setTracking(frame.present)
    hud.setFps(fps)
    const tl = frame.corners?.[0]
    debug.textContent =
      `frame ${frame.present ? 'LOCKED' : 'NO HANDS'}   effect ${effect + 1}/8\n` +
      `roll ${((frame.roll * 180) / Math.PI).toFixed(1)}°   ` +
      `tl ${tl ? `${tl.x.toFixed(2)},${tl.y.toFixed(2)}` : '--'}`

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

void main()
