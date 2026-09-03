// 06 NEON FLUID — ten fingertips inject DEXA ink into a GPU fluid field;
// pinching turns the current hand's fingertip splats into a radial ink drop.
import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { coverMap } from '../lib/cover'
import { createTexture, uploadVideo } from '../lib/gl'
import { createHud, showCameraError } from '../lib/hud'
import { createTwoHandTracker } from '../lib/tracking/hands2'
import type { HandData } from '../lib/tracking/hands2'
import { ambientEmitter, computeEmitters, isPinching } from './emitters'
import type { Emitter } from './emitters'
import { createFluid } from './sim'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const NO_EMITTERS: Emitter[] = []

async function main(): Promise<void> {
  const hud = createHud({
    title: '06 NEON FLUID',
    sub: 'HAND-DRIVEN FLUID SIM',
    hint: '손을 들어 허공을 저어 보세요 · 엄지와 검지를 집으면 잉크가 터집니다',
    snapshot: () => canvas,
    slug: 'fluid',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createTwoHandTracker(video)
  window.addEventListener('pagehide', () => {
    tracker.dispose()
    stopCamera(video)
  })

  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) {
    console.error('[fluid] WebGL2 is not available')
    return
  }

  const fluid = createFluid(gl, { simRes: 128, dyeRes: 1024 })
  const videoTexture = createTexture(gl, { filter: 'linear', wrap: 'clamp' })
  const resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.max(1, Math.round(innerWidth * dpr))
    canvas.height = Math.max(1, Math.round(innerHeight * dpr))
    fluid.resize(canvas.width, canvas.height)
  }
  resize()
  window.addEventListener('resize', resize)

  let feedVisible = true
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    if (key === 'c') {
      fluid.clear()
      hud.flash('CLEARED')
    } else if (key === 'v') {
      feedVisible = !feedVisible
      hud.flash(feedVisible ? 'FEED ON' : 'FEED OFF')
    }
  })

  const startedAt = performance.now()
  let lastFrameAt = startedAt
  let lastHandFrameAt = startedAt
  let lastAmbientAt = -Infinity
  let fps = 60
  let presence = 0
  let sampledHands: HandData[] | null = null
  let previousHands: HandData[] | null = null
  const pinching = [false, false]

  const loop = (): void => {
    const now = performance.now()
    const dt = Math.min((now - lastFrameAt) / 1000, 0.1)
    const t = (now - startedAt) / 1000
    lastFrameAt = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const tracking = tracker.read()
    presence += ((tracking.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))
    let emitters = NO_EMITTERS
    let emitterDt = dt

    // The tracker can return the same result across two display frames. Inject
    // only on fresh camera frames so velocity and dye do not depend on monitor Hz.
    if (tracking.hands !== sampledHands) {
      const handDt = Math.min(Math.max((now - lastHandFrameAt) / 1000, 1 / 120), 0.1)
      lastHandFrameAt = now
      sampledHands = tracking.hands

      if (tracking.present) {
        emitters = computeEmitters(previousHands, tracking.hands, handDt, t)
        emitterDt = handDt
        let dropped = false
        for (let handIdx = 0; handIdx < tracking.hands.length; handIdx++) {
          const nowPinching = isPinching(tracking.hands[handIdx])
          const burst = nowPinching && !pinching[handIdx]
          for (let finger = 0; finger < 5; finger++) {
            const emitter = emitters[handIdx * 5 + finger]
            if (!burst && emitter.burst) {
              emitter.burst = false
              emitter.radius *= 0.25
            }
          }
          pinching[handIdx] = nowPinching
          dropped ||= burst
        }
        for (let i = tracking.hands.length; i < pinching.length; i++) pinching[i] = false
        if (dropped) hud.flash('INK DROP')
        previousHands = tracking.hands
      } else {
        previousHands = null
        pinching[0] = false
        pinching[1] = false
      }
    }

    const cover = coverMap(
      video.videoWidth,
      video.videoHeight,
      canvas.width,
      canvas.height,
    )
    if (emitters.length) {
      mapToCanvas(emitters, emitterDt, cover.toScreen, canvas.width, canvas.height)
      const fade = 0.45 + presence * 0.55
      for (const emitter of emitters) {
        emitter.color[0] *= fade
        emitter.color[1] *= fade
        emitter.color[2] *= fade
      }
    } else if (!tracking.present && t - lastAmbientAt >= 1.5) {
      emitters = [ambientEmitter(t, Math.random)]
      lastAmbientAt = t
    }

    uploadVideo(gl, videoTexture, video)
    fluid.step(dt, emitters)
    fluid.render(feedVisible ? videoTexture : null, 0.25, cover.coverX, cover.coverY)

    hud.setTracking(tracking.present)
    hud.setFps(fps)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function mapToCanvas(
  emitters: Emitter[],
  dt: number,
  toScreen: (point: { x: number; y: number }) => { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  const safeDt = Math.max(dt, 1e-6)
  for (const emitter of emitters) {
    const current = toScreen(emitter)
    const previous = toScreen({
      x: emitter.x - emitter.dx * safeDt,
      y: emitter.y - emitter.dy * safeDt,
    })
    emitter.x = current.x / canvasWidth
    emitter.y = current.y / canvasHeight
    emitter.dx = (current.x - previous.x) / canvasWidth / safeDt
    emitter.dy = (current.y - previous.y) / canvasHeight / safeDt
  }
}

void main()
