import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { coverMap } from '../lib/cover'
import { createHud, showCameraError } from '../lib/hud'
import { OneEuroFilter } from '../lib/math/one-euro'
import type { Vec2 } from '../lib/math/quad'
import { createFaceBlendTracker, FACE_OVAL, FACE_POINTS } from '../lib/tracking/face-blend'
import { createDust, faceYaw, mouthGate, ovalBBox, seedHomes, step } from './particles'
import type { BBox, FaceInput } from './particles'
import { createDustRenderer } from './render'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

async function main(): Promise<void> {
  const hud = createHud({
    title: '05 DUST FACE',
    sub: 'BLENDSHAPE PARTICLES',
    hint: '카메라를 정면으로 보세요 · 입을 벌리면 얼굴이 흩어집니다 · 다물면 돌아옵니다',
    snapshot: () => canvas,
    slug: 'dust',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createFaceBlendTracker(video)
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) {
    console.error('[dust] WebGL2 is not available')
    tracker.dispose()
    stopCamera(video)
    return
  }

  const renderer = createDustRenderer(gl)
  let dust = createDust(20000)
  let dpr = 1
  const resize = (): void => {
    dpr = Math.min(window.devicePixelRatio, 2)
    canvas.width = Math.round(window.innerWidth * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)
  }
  resize()
  window.addEventListener('resize', resize)

  const bboxFilters = {
    x: new OneEuroFilter(1.2, 0.35),
    y: new OneEuroFilter(1.2, 0.35),
    w: new OneEuroFilter(1.0, 0.25),
    h: new OneEuroFilter(1.0, 0.25),
  }
  const mouthFilters = {
    x: new OneEuroFilter(1.4, 0.45),
    y: new OneEuroFilter(1.4, 0.45),
  }
  const yawFilter = new OneEuroFilter(1.1, 0.2)
  const oval = FACE_OVAL.map((): Vec2 => ({ x: 0, y: 0 }))
  const trackedBBox: BBox = { x: 0, y: 0, w: 0, h: 0 }
  const trackedMouth: Vec2 = { x: 0, y: 0 }
  const faceInput: FaceInput = {
    present: false,
    bbox: null,
    mouth: null,
    jawOpen: 0,
    browUp: 0,
    yaw: 0,
  }

  let hasOval = false
  let reseedPending = false
  let showVideo = false
  const onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase()
    if (key === 'v') {
      showVideo = !showVideo
      hud.flash(showVideo ? 'LIVE FEED ON' : 'LIVE FEED OFF')
    } else if (key === 'r') {
      if (hasOval) {
        seedHomes(dust, oval, Math.random)
        hud.flash('RESEEDED')
      } else {
        reseedPending = true
      }
    }
  }
  window.addEventListener('keydown', onKeyDown)

  const resetFilters = (): void => {
    bboxFilters.x.reset()
    bboxFilters.y.reset()
    bboxFilters.w.reset()
    bboxFilters.h.reset()
    mouthFilters.x.reset()
    mouthFilters.y.reset()
    yawFilter.reset()
  }

  const t0 = performance.now()
  let last = t0
  let fps = 60
  let lowFpsFor = 0
  let degraded = false
  let presence = 0
  let wasPresent = false
  let wasOpen = false
  let running = true
  let raf = 0

  const loop = (): void => {
    if (!running) return
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    const time = (now - t0) / 1000
    last = now
    const instantFps = 1 / Math.max(dt, 1e-3)
    fps += (instantFps - fps) * (1 - Math.exp(-dt * 3))
    lowFpsFor = fps < 40 ? lowFpsFor + dt : 0

    const mapping = coverMap(
      video.videoWidth,
      video.videoHeight,
      canvas.width,
      canvas.height,
    )
    const face = tracker.read()
    const landmarks = face.landmarks
    if (face.present && landmarks) {
      if (!wasPresent) resetFilters()
      for (let i = 0; i < FACE_OVAL.length; i++) {
        const p = mapping.toScreen(landmarks[FACE_OVAL[i]])
        oval[i].x = p.x
        oval[i].y = p.y
      }

      const rawBBox = ovalBBox(oval)
      trackedBBox.x = bboxFilters.x.filter(rawBBox.x, time)
      trackedBBox.y = bboxFilters.y.filter(rawBBox.y, time)
      trackedBBox.w = bboxFilters.w.filter(rawBBox.w, time)
      trackedBBox.h = bboxFilters.h.filter(rawBBox.h, time)

      const upper = mapping.toScreen(landmarks[FACE_POINTS.mouthUpper])
      const lower = mapping.toScreen(landmarks[FACE_POINTS.mouthLower])
      trackedMouth.x = mouthFilters.x.filter((upper.x + lower.x) * 0.5, time)
      trackedMouth.y = mouthFilters.y.filter((upper.y + lower.y) * 0.5, time)

      hasOval = true
      if (!dust.seeded || reseedPending) {
        seedHomes(dust, oval, Math.random)
        if (reseedPending) hud.flash('RESEEDED')
        reseedPending = false
      }

      faceInput.present = true
      faceInput.bbox = trackedBBox
      faceInput.mouth = trackedMouth
      faceInput.jawOpen = face.blend.jawOpen ?? 0
      faceInput.browUp = face.blend.browInnerUp ?? 0
      faceInput.yaw = yawFilter.filter(faceYaw(landmarks), time)

      const open = mouthGate(wasOpen, faceInput.jawOpen)
      if (open !== wasOpen) hud.flash(open ? 'SCATTER' : 'REFORM')
      wasOpen = open
    } else {
      faceInput.present = false
      faceInput.bbox = hasOval ? trackedBBox : null
      faceInput.mouth = null
      faceInput.jawOpen = 0
      faceInput.browUp = 0
      faceInput.yaw = 0
      wasOpen = false
    }
    wasPresent = face.present
    presence += ((face.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))

    if (!degraded && lowFpsFor >= 3) {
      degraded = true
      dust = createDust(10000)
      if (hasOval) seedHomes(dust, oval, Math.random)
      hud.flash('PERFORMANCE MODE')
    }

    step(dust, dt, faceInput, time)
    renderer.render(video, dust, hasOval ? trackedBBox : null, {
      coverX: mapping.coverX,
      coverY: mapping.coverY,
      dpr,
      time,
      presence,
      showVideo,
    })

    hud.setTracking(face.present)
    hud.setFps(fps)
    raf = requestAnimationFrame(loop)
  }

  const cleanup = (): void => {
    if (!running) return
    running = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    renderer.dispose()
    tracker.dispose()
    stopCamera(video)
  }
  window.addEventListener('pagehide', cleanup, { once: true })
  raf = requestAnimationFrame(loop)
}

void main()
