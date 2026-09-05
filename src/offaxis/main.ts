// Eye translation remains folded into kooimaProjection. Never move the camera
// as well: doing so applies tracking twice and breaks the fixed screen plane.
import '../theme/dexa-theme.css'
import '../lib/hand-lab.css'
import { dockLabSnapshot, reloadOnPageRestore } from '../lib/lab-layout'
import * as THREE from 'three'
import { initCamera, stopCamera } from '../lib/camera'
import { createFaceTracker } from '../lib/tracking/face'
import { createHandPoseTracker } from '../lib/tracking/hand-pose'
import { coverMap } from '../lib/cover'
import { createHud } from '../lib/hud'
import { getScreenWidthM, setScreenWidthM, getParallaxGain, setParallaxGain } from '../lib/config'
import { OneEuroVec3 } from '../lib/math/one-euro'
import { kooimaProjection } from '../lib/math/offaxis-projection'
import { createRoom } from './scene'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const REST = { x: 0, y: 0, z: 0.55 }
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

function main(): void {
  reloadOnPageRestore()
  const hud = createHud({
    title: '01 OFF-AXIS WINDOW', sub: 'DEPTH / LIGHT',
    hint: '머리를 움직여 공간을 들여다보세요 · 손으로 광원 이동 · - / = 화면 크기 · [ / ] 반응 강도',
    snapshot: () => canvas, slug: 'offaxis',
  })
  document.body.append(hud.el)
  const debug = document.createElement('div')
  debug.className = 'hud-chip hud-debug'
  debug.style.cssText = 'top:100px;bottom:auto;left:auto;right:22px;font-size:10px;pointer-events:none'
  hud.el.append(debug)
  const controls = document.createElement('div')
  controls.className = 'lab-controls'
  controls.innerHTML = '<button data-action="camera" type="button">웹캠 연결</button><button data-action="reset" type="button">처음부터</button><span class="lab-input-status" role="status">마우스 체험 · 이동: 시점 · 드래그: 광원 · Shift + 드래그: 반사판</span>'
  document.body.append(controls)
  const cameraButton = controls.querySelector<HTMLButtonElement>('[data-action="camera"]')!
  const status = controls.querySelector<HTMLElement>('.lab-input-status')!
  const abort = new AbortController(), signal = abort.signal
  let tracker: Awaited<ReturnType<typeof createFaceTracker>> | null = null
  let handTracker: Awaited<ReturnType<typeof createHandPoseTracker>> | null = null
  let closed = false, busy = false, epoch = 0, raf = 0
  let pip: HTMLVideoElement | null = null
  let pose = { present: false, ...REST }
  let hand: { x: number; y: number } | null = null
  const pointer = { x: 0.5, y: 0.5, active: false, down: false, shift: false }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setClearColor(0x090f13, 1)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.3
  const room = createRoom()
  const camera = new THREE.PerspectiveCamera()
  camera.matrixAutoUpdate = false
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3()
  function applyScreen(): void {
    const w = getScreenWidthM(), h = w * innerHeight / innerWidth
    pa.set(-w / 2, -h / 2, 0); pb.set(w / 2, -h / 2, 0); pc.set(-w / 2, h / 2, 0)
    room.setScreenSize(w, h)
  }
  function resize(): void {
    dockLabSnapshot(hud.el, controls)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.setSize(innerWidth, innerHeight, false)
    applyScreen()
  }
  resize()
  addEventListener('resize', resize, { signal })
  function endCamera(): void {
    tracker?.dispose(); tracker = null
    handTracker?.dispose(); handTracker = null
    stopCamera(video)
    pip?.remove(); pip = null
    pose = { present: false, ...REST }; hand = null
    cameraButton.textContent = '웹캠 연결'
  }
  async function connect(): Promise<void> {
    if (busy || closed) return
    if (tracker) { endCamera(); status.textContent = '마우스 체험 · 이동: 시점 · 드래그: 광원 · Shift + 드래그: 반사판'; return }
    busy = true; cameraButton.disabled = true
    const token = ++epoch
    try {
      await initCamera(video)
      if (closed || token !== epoch) { stopCamera(video); return }
      const face = await createFaceTracker(video)
      if (closed || token !== epoch) { face.dispose(); stopCamera(video); return }
      tracker = face
      // Head tracking remains usable if the optional hand model cannot load.
      try {
        const hands = await createHandPoseTracker(video)
        if (closed || token !== epoch) { hands.dispose(); return }
        handTracker = hands
      } catch (error) { console.warn('[hand tracking unavailable]', error) }
      cameraButton.textContent = '마우스로 전환'
      status.textContent = '웹캠 연결됨 · 머리: 시점 · 손: 광원 · 영상은 이 기기에서만 처리됩니다'
    } catch (error) {
      endCamera()
      status.textContent = '카메라 연결 실패 · 마우스로 시점과 빛을 계속 탐색할 수 있습니다'
      console.warn('[camera]', error)
    } finally { busy = false; cameraButton.disabled = closed }
  }
  cameraButton.addEventListener('click', () => { void connect() }, { signal })
  controls.querySelector('[data-action="reset"]')!.addEventListener('click', () => { room.reset(); pointer.active = false; hud.flash('RESET') }, { signal })
  const move = (e: PointerEvent): void => {
    pointer.x = clamp(e.clientX / innerWidth, 0, 1); pointer.y = clamp(e.clientY / innerHeight, 0, 1)
    pointer.active = true; pointer.shift = e.shiftKey
  }
  canvas.addEventListener('pointermove', move, { signal })
  canvas.addEventListener('pointerdown', e => { move(e); pointer.down = true; canvas.setPointerCapture(e.pointerId) }, { signal })
  canvas.addEventListener('pointerup', () => { pointer.down = false }, { signal })
  canvas.addEventListener('pointerleave', () => { if (!pointer.down) pointer.active = false }, { signal })
  canvas.addEventListener('pointercancel', () => { pointer.active = false; pointer.down = false }, { signal })
  addEventListener('blur', () => { pointer.active = false; pointer.down = false }, { signal })
  window.addEventListener('keydown', e => {
    if (e.key === '-' || e.key === '=') {
      const w = clamp(Math.round((getScreenWidthM() + (e.key === '=' ? 0.05 : -0.05)) * 100) / 100, 0.3, 1.2)
      setScreenWidthM(w); applyScreen(); hud.flash(`SCREEN ${w.toFixed(2)} m`)
    }
    if (e.key === '[' || e.key === ']') {
      const g = clamp(Math.round((getParallaxGain() + (e.key === ']' ? 0.05 : -0.05)) * 100) / 100, 0.1, 1)
      setParallaxGain(g); hud.flash(`PARALLAX ${Math.round(g * 100)}%`)
    }
    if (e.key === 'v' && video.srcObject) {
      if (pip) { pip.remove(); pip = null; return }
      pip = document.createElement('video'); pip.muted = true; pip.playsInline = true; pip.srcObject = video.srcObject
      pip.style.cssText = 'position:fixed;right:18px;bottom:90px;width:176px;height:132px;object-fit:cover;transform:scaleX(-1);border:1px solid #5ee7f3;border-radius:6px;z-index:12;pointer-events:none'
      document.body.append(pip); void pip.play()
    }
  }, { signal })
  const smooth = new OneEuroVec3(0.6, 0.03), lightSmooth = new OneEuroVec3(1, 0.05)
  const target = { ...REST }
  let last = performance.now(), inferenceAt = 0, fps = 60
  function loop(now: number): void {
    if (closed) return
    const dt = clamp((now - last) / 1000, 0.001, 0.1)
    fps += (1 / dt - fps) * 0.1; last = now
    if (tracker && now - inferenceAt >= 40) {
      inferenceAt = now
      try {
        pose = tracker.read()
        const p = handTracker?.read().landmarks?.[8]
        if (p) {
          const mapped = coverMap(video.videoWidth, video.videoHeight, innerWidth, innerHeight).toScreen(p)
          hand = { x: mapped.x / innerWidth, y: mapped.y / innerHeight }
        } else hand = null
      } catch (error) { endCamera(); status.textContent = '추적 중단 · 마우스로 계속 체험할 수 있습니다'; console.warn('[tracking]', error) }
    }
    if (pose.present) {
      const g = getParallaxGain()
      target.x = pose.x * g; target.y = pose.y * g
      target.z = REST.z + (clamp(pose.z, 0.2, 2) - REST.z) * g
    } else if (pointer.active && !pointer.down) {
      target.x = (pointer.x - 0.5) * 0.32
      target.y = (0.5 - pointer.y) * 0.2
      target.z = REST.z
    } else if (!pointer.down) {
      const k = 1 - Math.exp(-dt / 0.5)
      target.x += (REST.x - target.x) * k; target.y += (REST.y - target.y) * k; target.z += (REST.z - target.z) * k
    }
    const eye = smooth.filter(target, now / 1000)
    camera.projectionMatrix.fromArray(kooimaProjection(pa, pb, pc, eye, 0.01, 10))
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    if (pointer.down) {
      if (pointer.shift) room.setMirror((pointer.x - 0.5) * 2.5, (pointer.y - 0.5) * 0.9)
      else room.setLight(pointer.x, pointer.y)
    } else if (hand) {
      const p = lightSmooth.filter({ ...hand, z: 0 }, now / 1000)
      room.setLight(p.x, p.y)
    }
    room.update(now / 1000)
    renderer.render(room.scene, camera)
    hud.setTracking(pose.present)
    hud.setFps(fps)
    canvas.dataset.input = tracker ? 'camera' : 'pointer'
    debug.textContent = `eye  ${eye.x.toFixed(3)}  ${eye.y.toFixed(3)}  ${eye.z.toFixed(3)}\nscreen ${getScreenWidthM().toFixed(2)}m · ${pose.present ? 'TRACKING' : 'NO FACE'}${!pose.present && pointer.active ? ' · MOUSE PREVIEW' : ''}`
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  addEventListener('pagehide', () => {
    closed = true; epoch++; cancelAnimationFrame(raf); abort.abort(); endCamera(); room.dispose(); renderer.dispose()
  }, { once: true })
}
main()
