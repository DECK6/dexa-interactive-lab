import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { coverMap } from '../lib/cover'
import { createHud, showCameraError } from '../lib/hud'
import { OneEuroFilter } from '../lib/math/one-euro'
import { createTwoHandTracker } from '../lib/tracking/hands2'
import { Board, HoldTimer, PinchGate, isFist, penTip, pinchRatio } from './ink'
import type { InkColor, Stroke } from './ink'
import { GraffitiRenderer } from './render'
import type { GraffitiFrame, PenCursor } from './render'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const DISSOLVE_SEC = 0.5

interface HandInkState {
  gate: PinchGate
  filterX: OneEuroFilter
  filterY: OneEuroFilter
  stroke: Stroke | null
  fist: boolean
  cursor: PenCursor
}

const createHandState = (color: InkColor): HandInkState => ({
  gate: new PinchGate(),
  filterX: new OneEuroFilter(1.5, 0.6),
  filterY: new OneEuroFilter(1.5, 0.6),
  stroke: null,
  fist: false,
  cursor: { x: 0, y: 0, color, pinching: false, holdProgress: 0 },
})

async function main(): Promise<void> {
  const hud = createHud({
    title: '07 AIR GRAFFITI',
    sub: 'PINCH-TO-DRAW LIGHT',
    hint: '엄지와 검지를 집고 허공에 그려 보세요 · 주먹을 쥐면 지워집니다 · S 저장',
    snapshot: () => canvas,
    slug: 'graffiti',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  let tracker: Awaited<ReturnType<typeof createTwoHandTracker>>
  try {
    tracker = await createTwoHandTracker(video)
  } catch (err) {
    stopCamera(video)
    showCameraError(err)
    return
  }

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    tracker.dispose()
    stopCamera(video)
    console.error('[graffiti] Canvas2D is not available')
    return
  }

  const board = new Board()
  const renderer = new GraffitiRenderer(ctx)
  const hold = new HoldTimer()
  const states = [createHandState('cyan'), createHandState('orange')]
  const activeStrokes: (Stroke | null)[] = [null, null]
  const cursors: PenCursor[] = []
  const frame: GraffitiFrame = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    presence: 0,
    dissolveAlpha: 1,
  }

  let dpr = 1
  const resize = (): void => {
    const previousWidth = canvas.width
    const previousHeight = canvas.height
    dpr = Math.min(window.devicePixelRatio, 2)
    const width = Math.round(window.innerWidth * dpr)
    const height = Math.round(window.innerHeight * dpr)

    if (previousWidth > 0 && previousHeight > 0 && (width !== previousWidth || height !== previousHeight)) {
      const scaleX = width / previousWidth
      const scaleY = height / previousHeight
      const widthScale = (scaleX + scaleY) * 0.5
      for (const stroke of board.strokes) {
        for (const p of stroke.points) {
          p.x *= scaleX
          p.y *= scaleY
          p.w *= widthScale
        }
      }
    }
    canvas.width = width
    canvas.height = height
  }
  resize()
  window.addEventListener('resize', resize)

  const endStroke = (state: HandInkState): void => {
    if (!state.stroke) return
    board.end(state.stroke)
    state.stroke = null
  }

  const endAllStrokes = (releaseGates: boolean): void => {
    for (const state of states) {
      endStroke(state)
      if (releaseGates) state.gate.update(Infinity)
    }
  }

  let dissolveStart = -1
  const beginDissolve = (timeSec: number): void => {
    if (dissolveStart >= 0) return
    endAllStrokes(true)
    dissolveStart = timeSec
    hud.flash('CLEARED')
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    const key = e.key.toLowerCase()
    if (key === 'c') beginDissolve(performance.now() / 1000)
    if (key === 'z' && dissolveStart < 0) {
      endAllStrokes(true)
      if (board.undo()) hud.flash('UNDO')
    }
  }
  window.addEventListener('keydown', onKeyDown)

  const t0 = performance.now()
  let last = t0
  let fps = 60
  let presence = 0
  let hasFlashedInk = false
  let raf = 0

  const loop = (): void => {
    const now = performance.now()
    const nowSec = now / 1000
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const tracked = tracker.read()
    const mapping = coverMap(video.videoWidth, video.videoHeight, canvas.width, canvas.height)
    cursors.length = 0
    let anyFist = false

    for (let i = 0; i < states.length; i++) {
      const state = states[i]
      const hand = tracked.hands[i]
      if (!hand) {
        state.gate.update(Infinity)
        state.fist = false
        state.cursor.holdProgress = 0
        endStroke(state)
        continue
      }

      const wasPinching = state.gate.active
      const pinching = state.gate.update(pinchRatio(hand))
      if (pinching && !wasPinching) {
        state.filterX.reset()
        state.filterY.reset()
      }

      const raw = penTip(hand)
      const filtered = {
        x: state.filterX.filter(raw.x, nowSec),
        y: state.filterY.filter(raw.y, nowSec),
      }
      const screen = mapping.toScreen(filtered)
      state.fist = isFist(hand.landmarks)
      anyFist ||= state.fist

      state.cursor.x = screen.x
      state.cursor.y = screen.y
      state.cursor.pinching = pinching
      state.cursor.holdProgress = 0
      cursors.push(state.cursor)

      if (pinching && !state.fist && dissolveStart < 0) {
        if (!state.stroke) {
          state.stroke = board.begin(state.cursor.color, dpr)
          if (!hasFlashedInk) {
            hasFlashedInk = true
            hud.flash('INK ON')
          }
        }
        state.stroke.add(screen, nowSec)
      } else {
        endStroke(state)
      }
    }

    if (hold.update(anyFist, dt)) beginDissolve(nowSec)
    for (const state of states) {
      if (state.fist) state.cursor.holdProgress = hold.progress
    }

    if (dissolveStart >= 0) {
      const elapsed = nowSec - dissolveStart
      if (elapsed >= DISSOLVE_SEC) {
        board.clear()
        dissolveStart = -1
        frame.dissolveAlpha = 1
      } else {
        frame.dissolveAlpha = 1 - elapsed / DISSOLVE_SEC
      }
    } else {
      frame.dissolveAlpha = 1
    }

    presence += ((tracked.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))
    activeStrokes[0] = states[0].stroke
    activeStrokes[1] = states[1].stroke
    frame.width = canvas.width
    frame.height = canvas.height
    frame.dpr = dpr
    frame.time = (now - t0) / 1000
    frame.presence = presence
    renderer.render(video, board, activeStrokes, cursors, frame)

    hud.setTracking(tracked.present)
    hud.setFps(fps)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    tracker.dispose()
    stopCamera(video)
  }, { once: true })
}

void main()
