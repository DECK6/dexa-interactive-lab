import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { coverMap } from '../lib/cover'
import { createHud, showCameraError } from '../lib/hud'
import { createSegmenter } from '../lib/tracking/segmenter'
import { createFlakes, maskMotion, releaseAll, stepFlakes } from './flakes'
import type { MaskFn } from './flakes'
import { createSnowRenderer } from './render'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const FLAKE_COUNT = 1800

async function main(): Promise<void> {
  const hud = createHud({
    title: '08 SNOWFALL',
    sub: 'MASK-COLLIDING SNOW',
    hint: '카메라 앞에 서 보세요 · 눈이 어깨 위에 쌓입니다 · 몸을 털면 떨어집니다',
    snapshot: () => canvas,
    slug: 'snow',
  })
  const loadChip = document.createElement('div')
  loadChip.className = 'hud-chip hud-debug'
  loadChip.textContent = 'SNOW LOAD 0'
  hud.el.append(loadChip)
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createSegmenter(video)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    tracker.dispose()
    stopCamera(video)
    return
  }

  const pixelRatio = (): number => Math.min(window.devicePixelRatio || 1, 2)
  let dpr = pixelRatio()
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  const flakes = createFlakes(FLAKE_COUNT, canvas.width, canvas.height, Math.random)
  const renderer = createSnowRenderer(ctx)

  const resize = (): void => {
    const oldW = canvas.width
    const oldH = canvas.height
    const oldDpr = dpr
    dpr = pixelRatio()
    canvas.width = Math.round(window.innerWidth * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)
    if (oldW <= 0 || oldH <= 0) return

    const sx = canvas.width / oldW
    const sy = canvas.height / oldH
    const velocityScale = dpr / oldDpr
    for (let i = 0; i < flakes.n; i++) {
      flakes.x[i] *= sx
      flakes.y[i] *= sy
      flakes.vx[i] *= velocityScale
      flakes.vy[i] *= velocityScale
    }
  }
  window.addEventListener('resize', resize)

  let previousMask: Float32Array | null = null
  let lastMaskVideoTime = -1
  let motion = 0
  let absenceSeconds = 0
  let releasedForAbsence = false
  let displayedLoad = 0
  let presence = 0
  let fps = 60
  let disposed = false
  let animationFrame = 0
  const startedAt = performance.now()
  let last = startedAt

  const reset = (): void => {
    releaseAll(flakes, Math.random)
    displayedLoad = -1
    hud.flash('RESET')
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'r' || event.key === 'R') reset()
  }
  window.addEventListener('keydown', onKeydown)

  const loop = (): void => {
    if (disposed) return
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const personMask = tracker.read()
    const hasNewMask =
      personMask.data !== null &&
      personMask.width > 0 &&
      personMask.height > 0 &&
      video.currentTime !== lastMaskVideoTime
    if (hasNewMask) {
      const data = personMask.data as Float32Array
      motion = maskMotion(previousMask, data)
      if (!previousMask || previousMask.length !== data.length) {
        previousMask = new Float32Array(data.length)
      }
      previousMask.set(data)
      renderer.updateMask(data, personMask.width, personMask.height)
      lastMaskVideoTime = video.currentTime
    } else {
      motion *= Math.exp(-3 * dt)
    }

    if (personMask.present) {
      absenceSeconds = 0
      releasedForAbsence = false
    } else {
      absenceSeconds += dt
      if (absenceSeconds >= 2 && !releasedForAbsence) {
        releaseAll(flakes, Math.random)
        releasedForAbsence = true
      }
    }
    presence += ((personMask.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))

    const mapping = coverMap(
      video.videoWidth,
      video.videoHeight,
      canvas.width,
      canvas.height,
    )
    const normOrigin = mapping.toNorm({ x: 0, y: 0 })
    const normUnit = mapping.toNorm({ x: 1, y: 1 })
    const normStepX = normUnit.x - normOrigin.x
    const normStepY = normUnit.y - normOrigin.y
    const collisionMask: MaskFn = (x: number, y: number): number => {
      if (releasedForAbsence || !personMask.data) return 0
      const u = normOrigin.x + x * normStepX
      const v = normOrigin.y + y * normStepY
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0
      return personMask.sample(u, v)
    }

    stepFlakes(
      flakes,
      dt,
      collisionMask,
      motion,
      canvas.width,
      canvas.height,
      dpr,
      Math.random,
    )
    renderer.draw({
      video,
      flakes,
      w: canvas.width,
      h: canvas.height,
      dpr,
      presence,
    })

    if (flakes.restCount !== displayedLoad) {
      displayedLoad = flakes.restCount
      loadChip.textContent = `SNOW LOAD ${displayedLoad}`
    }
    hud.setTracking(personMask.present)
    hud.setFps(fps)
    animationFrame = requestAnimationFrame(loop)
  }

  const dispose = (): void => {
    disposed = true
    cancelAnimationFrame(animationFrame)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeydown)
    tracker.dispose()
    stopCamera(video)
  }
  window.addEventListener('pagehide', dispose, { once: true })
  animationFrame = requestAnimationFrame(loop)
}

void main()
