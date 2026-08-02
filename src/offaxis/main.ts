// 01 OFF-AXIS WINDOW — the monitor as a hole in the wall.
//
// The face tracker gives the eye position in metres relative to the screen
// centre; kooimaProjection turns that plus the physical screen rectangle into
// an asymmetric frustum. That matrix already folds in the eye translation
// (see lib/math/offaxis-projection.ts), so the three.js camera stays at the
// world origin with an identity transform and we only assign projectionMatrix.
import '../theme/dexa-theme.css'
import * as THREE from 'three'
import { initCamera, stopCamera } from '../lib/camera'
import { createFaceTracker } from '../lib/tracking/face'
import { createHud, showCameraError } from '../lib/hud'
import { getScreenWidthM, setScreenWidthM, getParallaxGain, setParallaxGain } from '../lib/config'
import { OneEuroVec3 } from '../lib/math/one-euro'
import { kooimaProjection } from '../lib/math/offaxis-projection'
import { createRoom } from './scene'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

const NEAR = 0.01
const FAR = 10
const REST = { x: 0, y: 0, z: 0.55 } // where the eye drifts back to with no face
const REST_TAU = 0.5 // exponential ease → ~95% recovered in 1.5s
const SCREEN_STEP = 0.05
const SCREEN_MIN = 0.3
const SCREEN_MAX = 1.2

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

async function main(): Promise<void> {
  const hud = createHud({
    title: '01 OFF-AXIS WINDOW',
    sub: 'HEAD-TRACKED',
    hint: '화면 앞에서 머리를 움직여 보세요 · - / = 화면 크기 · [ / ] 반응 강도 · v 웹캠',
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

  const tracker = await createFaceTracker(video)
  addEventListener('pagehide', () => {
    tracker.dispose()
    stopCamera(video)
  })

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setClearColor(0x0d0e10, 1)

  await document.fonts.ready // the wordmark texture is baked once, with the real face
  const room = createRoom()

  const camera = new THREE.PerspectiveCamera()
  camera.matrixAutoUpdate = false // identity view: the eye lives in the projection

  // Screen rectangle in metres, recomputed on resize and on width changes.
  const pa = new THREE.Vector3()
  const pb = new THREE.Vector3()
  const pc = new THREE.Vector3()

  const applyScreen = (): void => {
    const w = getScreenWidthM()
    const h = w * (innerHeight / innerWidth)
    pa.set(-w / 2, -h / 2, 0)
    pb.set(w / 2, -h / 2, 0)
    pc.set(-w / 2, h / 2, 0)
    room.setScreenSize(w, h)
  }

  const resize = (): void => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(innerWidth, innerHeight, false)
    applyScreen()
  }
  resize()
  addEventListener('resize', resize)

  window.addEventListener('keydown', (e) => {
    if (e.key === '-' || e.key === '=') {
      const step = e.key === '=' ? SCREEN_STEP : -SCREEN_STEP
      const w = clamp(Math.round((getScreenWidthM() + step) * 100) / 100, SCREEN_MIN, SCREEN_MAX)
      setScreenWidthM(w)
      applyScreen()
      hud.flash(`SCREEN ${w.toFixed(2)} m`)
    }
    if (e.key === '[' || e.key === ']') {
      const step = e.key === ']' ? 0.05 : -0.05
      const g = clamp(Math.round((getParallaxGain() + step) * 100) / 100, 0.1, 1)
      setParallaxGain(g)
      hud.flash(`PARALLAX ${Math.round(g * 100)}%`)
    }
    if (e.key === 'v') togglePip()
  })

  // Low min-cutoff: small head-position noise (mostly the IPD-derived z) would
  // otherwise swing the deep background; beta keeps deliberate moves responsive.
  const smooth = new OneEuroVec3(0.6, 0.03)
  const target = { ...REST }
  const eye = { ...REST }

  let last = performance.now()
  let fps = 60

  const loop = (): void => {
    const now = performance.now()
    const dt = clamp((now - last) / 1000, 0.001, 0.1)
    fps += (1 / dt - fps) * 0.1
    last = now

    const pose = tracker.read()
    if (pose.present) {
      // Gain < 1 keeps the projection axis calm: full physical parallax swings
      // the whole frustum far more than feels right on an installation.
      const g = getParallaxGain()
      target.x = pose.x * g
      target.y = pose.y * g
      target.z = REST.z + (clamp(pose.z, 0.2, 2) - REST.z) * g
    } else {
      const k = 1 - Math.exp(-dt / REST_TAU)
      target.x += (REST.x - target.x) * k
      target.y += (REST.y - target.y) * k
      target.z += (REST.z - target.z) * k
    }

    const s = smooth.filter(target, now / 1000)
    eye.x = s.x
    eye.y = s.y
    eye.z = s.z

    camera.projectionMatrix.fromArray(kooimaProjection(pa, pb, pc, eye, NEAR, FAR))
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

    room.update(now / 1000)
    renderer.render(room.scene, camera)

    hud.setTracking(pose.present)
    hud.setFps(fps)
    debug.textContent =
      `eye   x ${eye.x.toFixed(3)}  y ${eye.y.toFixed(3)}  z ${eye.z.toFixed(3)}\n` +
      `screen ${getScreenWidthM().toFixed(2)}m   ${pose.present ? 'TRACKING' : 'NO FACE'}`

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// Mirrored self-view, so it is obvious what the tracker is looking at.
let pip: HTMLVideoElement | null = null

function togglePip(): void {
  if (pip) {
    pip.remove()
    pip = null
    return
  }
  pip = document.createElement('video')
  pip.muted = true
  pip.playsInline = true
  pip.srcObject = video.srcObject
  pip.style.cssText =
    'position:fixed;right:18px;bottom:18px;width:176px;height:132px;object-fit:cover;' +
    'transform:scaleX(-1);border:1px solid var(--cyan);border-radius:6px;' +
    'background:var(--ink-display);z-index:12;pointer-events:none;'
  document.body.append(pip)
  void pip.play()
}

void main()
