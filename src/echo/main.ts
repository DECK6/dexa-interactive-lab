import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { coverMap } from '../lib/cover'
import { createHud, showCameraError } from '../lib/hud'
import { createSegmenter } from '../lib/tracking/segmenter'
import { createEchoRenderer } from './render'
import { clampSpacing, FrameRing } from './ring'

const RING_CAPACITY = 32
const ECHO_COUNT = 6
const DEFAULT_SPACING = 0.12

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

async function main(): Promise<void> {
  const hud = createHud({
    title: '04 TIME ECHO',
    sub: 'SEGMENTATION TRAILS',
    hint: '움직여 보세요 · 과거의 내가 잔상으로 따라옵니다 · [ ] 간격 조절',
    snapshot: () => canvas,
    slug: 'echo',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createSegmenter(video)
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) {
    tracker.dispose()
    stopCamera(video)
    hud.flash('WEBGL2 REQUIRED')
    console.error('[echo] WebGL2 is not available')
    return
  }

  const ring = new FrameRing(RING_CAPACITY)
  const renderer = createEchoRenderer(gl, ring.capacity)
  const echoSlots = new Int32Array(ECHO_COUNT)
  echoSlots.fill(-1)

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = Math.round(window.innerWidth * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)
  }
  resize()
  window.addEventListener('resize', resize)

  let spacing = DEFAULT_SPACING
  let feed = true
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === '[' || e.key === ']') {
      const delta = e.key === '[' ? -0.02 : 0.02
      spacing = clampSpacing(spacing + delta)
      hud.flash(`SPACING ${Math.round(spacing * 1000)}MS`)
    } else if ((e.key === 'v' || e.key === 'V') && !e.repeat) {
      feed = !feed
      hud.flash(`FEED ${feed ? 'ON' : 'OFF'}`)
    }
  }
  window.addEventListener('keydown', onKey)

  const startedAt = performance.now()
  let last = startedAt
  let lastVideoTime = -1
  let liveSlot = -1
  let fps = 60
  let presence = 0
  let raf = 0
  let stopped = false

  const cleanup = (): void => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKey)
    renderer.dispose()
    tracker.dispose()
    stopCamera(video)
  }
  window.addEventListener('pagehide', cleanup, { once: true })

  const loop = (): void => {
    if (stopped) return

    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const mask = tracker.read()
    presence += ((mask.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))

    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime
      liveSlot = ring.push(lastVideoTime)
      renderer.writeSlot(liveSlot, video, mask.data, mask.width, mask.height)
    }

    for (let i = 0; i < ECHO_COUNT; i++) {
      const k = ECHO_COUNT - i
      echoSlots[i] = ring.pick(video.currentTime - k * spacing)
    }

    // Recompute the crop every frame so camera metadata and resizes cannot drift.
    const cover = coverMap(
      video.videoWidth,
      video.videoHeight,
      canvas.width,
      canvas.height,
    )
    renderer.draw({
      liveSlot,
      echoSlots,
      coverX: cover.coverX,
      coverY: cover.coverY,
      presence,
      feed,
      time: (now - startedAt) / 1000,
    })

    hud.setTracking(mask.present)
    hud.setFps(fps)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
}

void main()
