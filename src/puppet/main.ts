// 03 MARIONETTE — one tracked hand becomes a marionette control bar. Strings
// run from the five fingertips to a physics puppet: tilt and swing the hand to
// steer it, curl a finger to drop that limb, hide the hand and it collapses.
import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { createHandPoseTracker, FINGERTIPS } from '../lib/tracking/hand-pose'
import { createHud, showCameraError } from '../lib/hud'
import { OneEuroFilter } from '../lib/math/one-euro'
import { createPuppet, STRINGS } from './puppet'
import type { Anchors, Puppet, StringTarget, Vec2 } from './puppet'
import { drawScene, readTheme } from './render'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

async function main(): Promise<void> {
  const hud = createHud({
    title: '03 MARIONETTE',
    sub: 'HAND-STRUNG PUPPET',
    hint: '손바닥을 펴서 들어 보세요 · 기울이고 흔들면 퍼펫이 춤추고, 손가락을 굽히면 팔다리가 떨어집니다',
  })
  document.body.append(hud.el)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createHandPoseTracker(video)
  addEventListener('pagehide', () => {
    tracker.dispose()
    stopCamera(video)
  })

  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D
  const theme = readTheme()

  let puppet: Puppet
  let size = 0
  let floorY = 0
  const resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(innerWidth * dpr)
    canvas.height = Math.round(innerHeight * dpr)
    size = canvas.height * 0.3
    floorY = canvas.height * 0.9
    // Physics state is cheap to rebuild; a resize simply respawns the puppet.
    // Joints rest slightly above the drawn floor line so limb thickness
    // doesn't render through it.
    puppet = createPuppet({ x: canvas.width / 2, floorY: floorY - size * 0.04, size })
  }
  resize()
  addEventListener('resize', resize)

  // One filter per anchor coordinate. Snapped on reappearance like fingerframe.
  const filters = new Map<StringTarget, { x: OneEuroFilter; y: OneEuroFilter }>(
    STRINGS.map((t) => [t, { x: new OneEuroFilter(1.2, 0.5), y: new OneEuroFilter(1.2, 0.5) }]),
  )

  // Video-normalized point → screen px under a cover crop (feed fills viewport).
  const toScreen = (p: Vec2): Vec2 => {
    const va = video.videoWidth / video.videoHeight
    const ca = canvas.width / canvas.height
    return ca > va
      ? { x: p.x * canvas.width, y: (p.y - 0.5) * (canvas.width / va) + canvas.height / 2 }
      : { x: (p.x - 0.5) * (canvas.height * va) + canvas.width / 2, y: p.y * canvas.height }
  }

  const t0 = performance.now()
  let last = t0
  let fps = 60
  let presence = 0
  let wasPresent = false
  // Leftmost fingertip drives the puppet's left side. The thumb-vs-pinky x
  // order flips when the palm flips; hysteresis keeps it from chattering.
  let reversed = false

  const loop = (): void => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.1)
    last = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const pose = tracker.read()
    let anchors: Anchors | null = null
    let screenAnchors: Record<StringTarget, Vec2> | null = null

    if (pose.present && pose.landmarks) {
      if (!wasPresent) {
        for (const f of filters.values()) {
          f.x.reset()
          f.y.reset()
        }
        hud.flash('STRINGS ATTACHED')
      }

      const thumbX = pose.landmarks[FINGERTIPS[0]].x
      const pinkyX = pose.landmarks[FINGERTIPS[4]].x
      if (Math.abs(thumbX - pinkyX) > 0.02) reversed = thumbX > pinkyX

      screenAnchors = {} as Record<StringTarget, Vec2>
      STRINGS.forEach((t, i) => {
        const tip = FINGERTIPS[reversed ? STRINGS.length - 1 - i : i]
        const p = toScreen(pose.landmarks![tip])
        const f = filters.get(t)!
        screenAnchors![t] = { x: f.x.filter(p.x, now / 1000), y: f.y.filter(p.y, now / 1000) }
      })
      anchors = screenAnchors
    }
    wasPresent = pose.present
    presence += ((pose.present ? 1 : 0) - presence) * (1 - Math.exp(-dt * 6))

    puppet.step(dt, anchors)
    drawScene(ctx, theme, {
      w: canvas.width,
      h: canvas.height,
      floorY,
      size,
      puppet,
      anchors: screenAnchors,
      presence,
      time: (now - t0) / 1000,
    })

    hud.setTracking(pose.present)
    hud.setFps(fps)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

void main()
