import '../theme/dexa-theme.css'
import './style.css'
import { initCamera, stopCamera } from '../lib/camera'
import { createHandTracker, type FingerFrame } from '../lib/tracking/hands'
import { createHud } from '../lib/hud'
import { OneEuroFilter } from '../lib/math/one-euro'
import { TwistDetector } from '../lib/math/twist'
import type { Quad } from '../lib/math/quad'
import { EFFECTS } from './effects'
import { CaptureController, type CaptureEvent, type CapturePose } from './capture'
import { createFilterRenderer } from './filters'
import { createReliefRenderer } from './relief'
import { CameraAttemptGate } from './camera-attempt'
import { reloadOnPageRestore } from '../lib/lab-layout'
reloadOnPageRestore()

const filterCanvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement
const stage = document.querySelector('.stage') as HTMLElement
const reliefCanvas = document.createElement('canvas')
reliefCanvas.id = 'relief-stage'
stage.append(reliefCanvas)
const guide = document.createElement('canvas')
guide.className = 'frame-guide'
stage.append(guide)
const source = document.createElement('canvas')
const sourceCtx = source.getContext('2d', { willReadFrequently: true })!
const guideCtx = guide.getContext('2d')!
const hud = createHud({ title: '02 FINGER FRAME', sub: 'CAPTURE / TRANSFORM / PLACE', hint: '양손 엄지와 검지로 사각형을 만들어 보세요 · 0.7초 유지 → 이동·기울이기 → 손을 놓아 배치' })
document.body.append(hud.el)
const controls = document.createElement('section')
controls.className = 'ff-controls'
controls.setAttribute('aria-label', '핑거프레임 조작')
controls.innerHTML = `
  <div class="ff-switch" role="group" aria-label="표현 모드"><button data-mode="relief" aria-pressed="true">영상 부조</button><button data-mode="filters" aria-pressed="false">12 FILTERS</button></div>
  <div class="ff-eyebrow">FREEZE A MOMENT</div><h1>시간을 집어<br><span>공간에 남기다.</span></h1>
  <p class="ff-intro">장면 한 조각을 떼어내고,<br>기울여 보고, 여기 남겨 두세요.</p>
  <div class="ff-source"><span class="ff-source-dot"></span><span data-readout="input">포인터 프리뷰 · 생성 패턴</span></div>
  <button class="ff-mobile-toggle" type="button" aria-controls="ff-mobile-settings" aria-expanded="false">조작 설정 ▾</button>
  <div class="ff-camera-row"><button data-action="camera">카메라 켜기</button><button data-action="preview" aria-pressed="true">포인터 프리뷰</button></div>
  <p class="ff-notice" data-readout="notice">카메라 없이도 아래 버튼으로 체험할 수 있습니다.</p>
  <div class="ff-relief-controls">
    <ol class="ff-steps"><li data-step="capture"><b>01</b> 프레임 유지</li><li data-step="hold"><b>02</b> 이동 · 변형</li><li data-step="place"><b>03</b> 공간에 배치</li></ol>
    <div class="ff-progress"><i></i></div>
    <div class="ff-status" role="status" aria-live="polite" data-readout="status">프레임을 잡아 시작하세요</div>
    <div class="ff-actions"><button data-action="capture" class="primary">조각 잡기</button><button data-action="place" disabled>여기에 놓기</button></div>
    <div class="ff-transform">
    <label>기울기 <input aria-label="조각 기울기" data-control="tilt" type="range" min="-85" max="85" value="36"></label>
    <label>회전 <input aria-label="프레임 회전" data-control="rotation" type="range" min="-80" max="80" value="0"></label>
    <label>크기 <input aria-label="프레임 크기" data-control="scale" type="range" min="65" max="150" value="100"></label>
    <label>부조 깊이 <input aria-label="부조 깊이" data-control="depth" type="range" min="0" max="150" value="100"></label>
    </div>
    <p class="ff-gesture-help">프리뷰: 화면을 누른 채 0.7초 유지<br>드래그 이동 · 휠 크기 · 손을 떼면 배치</p>
  </div>
  <div class="ff-filter-controls" hidden><label for="effect-select">MATERIAL LIBRARY</label><select id="effect-select">${EFFECTS.map((e, i) => `<option value="${i}">${String(i + 1).padStart(2, '0')} / ${e.name}</option>`).join('')}</select><p>프레임을 비틀거나 목록에서 재질을 고르세요.<br>프리뷰에서는 포인터로 프레임을 옮깁니다.</p></div>
  <div class="ff-collection"><span data-readout="count">0 / 5 PIECES</span><button data-action="reset">비우기</button></div>
  <p class="ff-footnote">밝기로 만든 얕은 부조 · 실제 깊이 스캔 아님<br>카메라 영상은 이 브라우저 안에서만 처리합니다.</p>`
document.body.append(controls)
const find = <T extends HTMLElement>(selector: string): T => controls.querySelector(selector) as T
const captureButton = find<HTMLButtonElement>('[data-action="capture"]')
const placeButton = find<HTMLButtonElement>('[data-action="place"]')
const cameraButton = find<HTMLButtonElement>('[data-action="camera"]')
const status = find<HTMLElement>('[data-readout="status"]')
const count = find<HTMLElement>('[data-readout="count"]')
const notice = find<HTMLElement>('[data-readout="notice"]')
const inputLabel = find<HTMLElement>('[data-readout="input"]')
const effectSelect = find<HTMLSelectElement>('#effect-select')
// On small screens, keep acquisition and reset in view; settings get their own explicit drawer.
const mobileQuery = matchMedia('(max-width: 720px)')
const mobileToggle = find<HTMLButtonElement>('.ff-mobile-toggle')
const mobileSettings = document.createElement('div')
mobileSettings.id = 'ff-mobile-settings'
mobileSettings.className = 'ff-mobile-settings'
mobileSettings.setAttribute('aria-label', '카메라와 조각 조절 설정')
mobileSettings.tabIndex = 0
const movableSettings = ['.ff-transform', '.ff-switch', '.ff-camera-row', '.ff-notice', '.ff-filter-controls', '.ff-footnote'].map(selector => {
  const node = find<HTMLElement>(selector)
  const marker = document.createComment('desktop setting position')
  node.before(marker)
  return { node, marker }
})
function arrangeMobileSettings(): void {
  controls.dataset.expanded = 'false'
  mobileToggle.setAttribute('aria-expanded', 'false')
  mobileToggle.textContent = '조작 설정 ▾'
  if (mobileQuery.matches) {
    movableSettings.forEach(({ node }) => mobileSettings.append(node))
    controls.append(mobileSettings)
  } else {
    movableSettings.forEach(({ node, marker }) => marker.after(node))
    mobileSettings.remove()
  }
}
mobileToggle.addEventListener('click', () => {
  const expanded = controls.dataset.expanded !== 'true'
  controls.dataset.expanded = String(expanded)
  mobileToggle.setAttribute('aria-expanded', String(expanded))
  mobileToggle.textContent = expanded ? '설정 닫기 ▴' : '조작 설정 ▾'
})
mobileQuery.addEventListener('change', arrangeMobileSettings)
arrangeMobileSettings()
const controller = new CaptureController()
const reportRenderError = (error: unknown): void => {
  notice.textContent = '화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.'
  notice.setAttribute('role', 'alert')
  console.error('[fingerframe renderer]', error)
}
const filters = (() => { try { return createFilterRenderer(filterCanvas) } catch (error) { reportRenderError(error); throw error } })()
const relief = (() => { try { return createReliefRenderer(reliefCanvas, source) } catch (error) { filters.dispose(); reportRenderError(error); throw error } })()
const smoothers = Array.from({ length: 8 }, () => new OneEuroFilter(1.2, .55))
const twist = new TwistDetector()
let mode: 'relief' | 'filters' = 'relief'
let input: 'preview' | 'camera' = 'preview'
let tracker: Awaited<ReturnType<typeof createHandTracker>> | null = null
const cameraAttempts = new CameraAttemptGate()
let disposed = false
let presentBefore = false
let pointerHeld = false
let captureWithButton = false
let effect = 0
let depth = 1
let pointerScale = 1
let pointerPose: CapturePose = mobileQuery.matches
  ? { x: .5, y: .36, width: .52, height: .39 * innerWidth / innerHeight, roll: 0, tilt: .36 }
  : { x: .61, y: .50, width: .31, height: .34, roll: 0, tilt: .36 }
let currentQuad: Quad = poseQuad(pointerPose)
let currentPose: CapturePose | null = null
let lastTime = performance.now()
let fps = 60
let raf = 0
let lastStatus = ''
function reframePreviewForViewport(): void {
  if (controller.active || pointerHeld || captureWithButton) return
  pointerPose = mobileQuery.matches
    ? { ...pointerPose, x: .5, y: .36, width: .52, height: .39 * innerWidth / innerHeight }
    : { ...pointerPose, x: .61, y: .5, width: .31, height: .34 }
}
mobileQuery.addEventListener('change', reframePreviewForViewport)

function poseQuad(p: CapturePose): Quad {
  const c = Math.cos(p.roll), s = Math.sin(p.roll)
  return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => {
    const dx = x * p.width * innerWidth, dy = y * p.height * innerHeight
    return { x: p.x + (dx * c - dy * s) / innerWidth, y: p.y + (dx * s + dy * c) / innerHeight }
  }) as Quad
}
function cameraPose(frame: FingerFrame, now: number): CapturePose | null {
  if (!frame.present || !frame.corners || !video.videoWidth) { presentBefore = false; return null }
  if (!presentBefore) smoothers.forEach(s => s.reset())
  presentBefore = true
  const aspect = video.videoWidth / video.videoHeight, viewport = innerWidth / innerHeight
  const coverX = viewport > aspect ? 1 : viewport / aspect, coverY = viewport > aspect ? aspect / viewport : 1
  currentQuad = frame.corners.map((p, i) => ({ x: (smoothers[i * 2].filter(p.x, now) - .5) / coverX + .5, y: (smoothers[i * 2 + 1].filter(p.y, now) - .5) / coverY + .5 })) as Quad
  const q = currentQuad
  const edge = (a: number, b: number) => Math.hypot((q[a].x - q[b].x) * innerWidth, (q[a].y - q[b].y) * innerHeight)
  const left = edge(0, 3), right = edge(1, 2)
  return { x: q.reduce((n, p) => n + p.x, 0) / 4, y: q.reduce((n, p) => n + p.y, 0) / 4,
    width: (edge(0, 1) + edge(3, 2)) / (2 * innerWidth), height: (left + right) / (2 * innerHeight),
    roll: frame.roll, tilt: Math.max(-.85, Math.min(.85, .3 + (left - right) / Math.max(1, left + right) * 2)) }
}
function events(list: CaptureEvent[], now = performance.now() / 1000): void {
  for (const event of list) {
    if (event.type === 'capture') { relief.capture(event.id, currentQuad, now); hud.flash('CAPTURED · 이제 움직여 보세요') }
    if (event.type === 'dispose') relief.disposePiece(event.id)
    if (event.type === 'place') hud.flash('PLACED · 한 순간이 남았습니다')
  }
}
function place(): void {
  events(controller.place())
  captureWithButton = false
  pointerHeld = false
}
function setPreview(): void {
  cameraAttempts.cancel()
  tracker?.dispose(); tracker = null
  stopCamera(video)
  input = 'preview'
  place()
  cameraButton.disabled = cameraAttempts.busy
  cameraButton.textContent = '카메라 켜기'
  inputLabel.textContent = '포인터 프리뷰 · 생성 패턴'
  find('[data-action="preview"]').setAttribute('aria-pressed', 'true')
  notice.textContent = cameraAttempts.busy
    ? '카메라 요청의 응답을 기다리는 동안 포인터 프리뷰를 사용할 수 있습니다.'
    : '생성 패턴을 입력으로 사용합니다. 화면 또는 조각 잡기를 눌러 보세요.'
}
async function startCamera(): Promise<void> {
  if (cameraAttempts.busy) return
  if (input === 'camera') { setPreview(); return }
  const attempt = cameraAttempts.begin()
  if (attempt === null) return
  cameraButton.disabled = true
  notice.textContent = '카메라와 손 추적을 준비하고 있습니다…'
  let candidate: Awaited<ReturnType<typeof createHandTracker>> | null = null
  try {
    await initCamera(video)
    if (disposed || !cameraAttempts.accepts(attempt)) { stopCamera(video); return }
    candidate = await createHandTracker(video)
    if (disposed || !cameraAttempts.accepts(attempt)) { candidate.dispose(); stopCamera(video); return }
    tracker = candidate
    place()
    input = 'camera'
    cameraButton.textContent = '카메라 끄기'
    inputLabel.textContent = '라이브 카메라 · 양손 추적'
    find('[data-action="preview"]').setAttribute('aria-pressed', 'false')
    notice.textContent = '엄지·검지로 사각형을 만든 뒤 잠시 멈추세요. 손을 내리면 조각이 남습니다.'
  } catch {
    candidate?.dispose()
    if (!cameraAttempts.accepts(attempt) || disposed) return
    stopCamera(video)
    input = 'preview'
    notice.textContent = '카메라를 시작하지 못했습니다. 포인터 프리뷰는 계속 사용할 수 있습니다.'
    inputLabel.textContent = '포인터 프리뷰 · 카메라 연결 안 됨'
  } finally {
    cameraAttempts.finish(attempt)
    if (!disposed) cameraButton.disabled = cameraAttempts.busy
  }
}
cameraButton.addEventListener('click', () => { void startCamera() })
find('[data-action="preview"]').addEventListener('click', setPreview)
captureButton.addEventListener('click', () => {
  if (controller.active) return
  if (input === 'preview') {
    captureWithButton = !captureWithButton
    if (captureWithButton) controller.armManualCapture()
  }
  else notice.textContent = '양손으로 사각형을 0.7초 유지하면 자동으로 잡힙니다.'
})
placeButton.addEventListener('click', place)
function reset(): void { events(controller.reset()); captureWithButton = pointerHeld = false; hud.flash('COLLECTION CLEARED') }
find('[data-action="reset"]').addEventListener('click', reset)
controls.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => {
  place()
  mode = button.dataset.mode as typeof mode
  controls.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
  find<HTMLElement>('.ff-relief-controls').hidden = mode !== 'relief'
  find<HTMLElement>('.ff-transform').hidden = mode !== 'relief'
  find<HTMLElement>('.ff-filter-controls').hidden = mode !== 'filters'
  filterCanvas.hidden = mode !== 'filters'
  reliefCanvas.hidden = mode !== 'relief'
  document.body.dataset.mode = mode
}))
effectSelect.addEventListener('change', () => { effect = Number(effectSelect.value) })
find<HTMLInputElement>('[data-control="tilt"]').addEventListener('input', e => { pointerPose.tilt = Number((e.target as HTMLInputElement).value) / 100 })
find<HTMLInputElement>('[data-control="rotation"]').addEventListener('input', e => { pointerPose.roll = Number((e.target as HTMLInputElement).value) * Math.PI / 180 })
find<HTMLInputElement>('[data-control="scale"]').addEventListener('input', e => { pointerScale = Number((e.target as HTMLInputElement).value) / 100 })
find<HTMLInputElement>('[data-control="depth"]').addEventListener('input', e => { depth = Number((e.target as HTMLInputElement).value) / 100 })
stage.addEventListener('pointermove', e => {
  if (input !== 'preview') return
  pointerPose.x = Math.max(.1, Math.min(.9, e.clientX / innerWidth))
  pointerPose.y = Math.max(.12, Math.min(.86, e.clientY / innerHeight))
})
stage.addEventListener('pointerdown', e => {
  if (input !== 'preview') return
  if (!controller.active) controller.armManualCapture()
  pointerHeld = true
  stage.setPointerCapture(e.pointerId)
})
stage.addEventListener('pointerup', () => { if (pointerHeld) place() })
stage.addEventListener('pointercancel', () => { if (pointerHeld) place() })
stage.addEventListener('wheel', e => {
  if (input !== 'preview') return
  e.preventDefault()
  pointerScale = Math.max(.65, Math.min(1.5, pointerScale - e.deltaY * .001))
  find<HTMLInputElement>('[data-control="scale"]').value = String(pointerScale * 100)
}, { passive: false })
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement) return
  if (e.code === 'Space') { e.preventDefault(); if (controller.active) place(); else if (input === 'preview') { controller.armManualCapture(); captureWithButton = true } }
  if (e.key === 'Escape') place()
  if (e.key.toLowerCase() === 'r') reset()
})

function drawSource(now: number): void {
  const w = Math.min(960, innerWidth), h = Math.round(w * innerHeight / innerWidth)
  if (source.width !== w || source.height !== h) { source.width = w; source.height = h }
  const ctx = sourceCtx
  if (input === 'camera' && video.readyState >= 2) {
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight)
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, (w - video.videoWidth * scale) / 2, (h - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale)
    ctx.restore()
    return
  }
  ctx.fillStyle = '#0a161c'; ctx.fillRect(0, 0, w, h)
  const x = w * (mobileQuery.matches ? .5 : .61), y = h * (mobileQuery.matches ? .36 : .48), r = Math.min(w * .31, h * .41)
  const glow = ctx.createRadialGradient(x, y, 5, x, y, r * 1.5)
  glow.addColorStop(0, '#31535c'); glow.addColorStop(1, '#0a161c')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#9eeaff15'; ctx.lineWidth = .7
  for (let i = -24; i < 25; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 36, 0); ctx.lineTo(x + i * 36, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, y + i * 36); ctx.lineTo(w, y + i * 36); ctx.stroke()
  }
  const sphere = ctx.createRadialGradient(x - r * .35, y - r * .5, r * .02, x, y, r)
  sphere.addColorStop(0, '#f1f1c0'); sphere.addColorStop(.3, '#91ebd4'); sphere.addColorStop(.67, '#279c9c'); sphere.addColorStop(.92, '#123d52'); sphere.addColorStop(1, '#040b10')
  ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip()
  for (let i = 0; i < 38; i++) {
    ctx.strokeStyle = i % 4 === 0 ? '#eeffdc99' : '#0b3b4988'
    ctx.lineWidth = i % 4 === 0 ? 1.5 : .8
    ctx.beginPath()
    for (let n = 0; n <= 70; n++) {
      const px = x - r + n / 70 * r * 2
      const py = y - r + i / 37 * r * 2 + Math.sin(n / 70 * 8 + i * .24 + now * .17) * r * .13
      if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
  ctx.strokeStyle = '#ff7745'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * .23, -.35, 0, Math.PI); ctx.stroke()
  const ox = x + Math.cos(now * .25) * r * 1.13, oy = y + Math.sin(now * .25) * r * .37
  ctx.fillStyle = '#ff8750'; ctx.beginPath(); ctx.arc(ox, oy, r * .055, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#c2e5df'; ctx.font = `${Math.max(9, w / 85)}px monospace`
  ctx.fillText('GENERATED STUDY / 02', w * .43, h * .84)
  ctx.fillStyle = '#5d8d94'; ctx.fillText(`T + ${now.toFixed(1).padStart(6, '0')}     NO CAMERA FEED`, w * .43, h * .88)
}
function drawGuide(quad: Quad, showing: boolean): void {
  const dpr = Math.min(devicePixelRatio, 1.5)
  if (guide.width !== Math.round(innerWidth * dpr) || guide.height !== Math.round(innerHeight * dpr)) { guide.width = Math.round(innerWidth * dpr); guide.height = Math.round(innerHeight * dpr) }
  const ctx = guideCtx
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight)
  if (!showing || controller.active || mode === 'filters') return
  const q = quad.map(p => ({ x: p.x * innerWidth, y: p.y * innerHeight }))
  ctx.strokeStyle = controller.phase === 'focusing' ? '#ff8255' : '#5ee7f3aa'
  ctx.lineWidth = 1; ctx.setLineDash([5, 7]); ctx.beginPath()
  q.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([])
  ctx.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    const p = q[i], next = q[(i + 1) % 4], prev = q[(i + 3) % 4]
    ctx.beginPath(); ctx.moveTo(p.x + (prev.x - p.x) * .08, p.y + (prev.y - p.y) * .08); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + (next.x - p.x) * .08, p.y + (next.y - p.y) * .08); ctx.stroke()
  }
  ctx.fillStyle = '#b9e7e8'; ctx.font = '10px monospace'
  ctx.fillText(controller.phase === 'focusing' ? `HOLD  ${Math.round(controller.progress * 100)}%` : 'HOLD TO CAPTURE', q[0].x, q[0].y - 13)
}
function updateUi(): void {
  const messages = { idle: '프레임을 잡아 시작하세요', focusing: '잠시 멈추세요 · 장면을 잡는 중', holding: '잡았습니다 · 움직이고 기울여 보세요', recovering: '손을 찾는 중 · 마지막 위치를 유지합니다', cooldown: '놓았습니다 · 손을 펴서 다음 조각을 준비하세요' }
  const next = messages[controller.phase]
  if (next !== lastStatus) { status.textContent = next; lastStatus = next }
  controls.dataset.phase = controller.phase
  find<HTMLElement>('.ff-progress i').style.width = `${controller.progress * 100}%`
  captureButton.disabled = Boolean(controller.active) || input === 'camera'
  captureButton.textContent = captureWithButton && !controller.active ? '잡기 취소' : '조각 잡기'
  placeButton.disabled = !controller.active
  count.textContent = `${controller.pieces.length} / 5 PIECES`
  document.body.dataset.pieces = String(controller.pieces.length)
  document.body.dataset.phase = controller.phase
}
function loop(): void {
  if (disposed) return
  const now = performance.now(), seconds = now / 1000, dt = Math.min(.1, (now - lastTime) / 1000)
  lastTime = now; fps += (1 / Math.max(.001, dt) - fps) * .06
  drawSource(seconds)
  if (input === 'camera' && tracker) {
    let frame: FingerFrame = { present: false, corners: null, roll: 0 }
    try { frame = tracker.read() } catch {
      setPreview()
      notice.textContent = '손 추적이 중단되어 포인터 프리뷰로 전환했습니다.'
    }
    currentPose = cameraPose(frame, seconds)
    if (mode === 'filters') {
      const dir = frame.present ? twist.update(frame.roll, now) : 0
      if (dir) { effect = (effect + dir + EFFECTS.length) % EFFECTS.length; effectSelect.value = String(effect); hud.flash(EFFECTS[effect].name) }
    }
  } else {
    const p = { ...pointerPose, width: pointerPose.width * pointerScale, height: pointerPose.height * pointerScale }
    currentQuad = poseQuad(p)
    currentPose = pointerHeld || captureWithButton ? p : null
  }
  if (mode === 'relief') {
    events(controller.update(currentPose, dt), seconds)
    relief.render(controller.pieces, seconds, depth)
  } else filters.render(source, currentQuad, input === 'preview' || currentPose ? 1 : 0, effect, seconds)
  drawGuide(currentQuad, input === 'preview' || Boolean(currentPose))
  hud.setTracking(input === 'camera' && Boolean(currentPose)); hud.setFps(fps)
  updateUi()
  raf = requestAnimationFrame(loop)
}
filterCanvas.hidden = true
document.body.dataset.mode = mode
raf = requestAnimationFrame(loop)
addEventListener('pagehide', () => {
  disposed = true; cameraAttempts.cancel(); cancelAnimationFrame(raf)
  mobileQuery.removeEventListener('change', arrangeMobileSettings)
  mobileQuery.removeEventListener('change', reframePreviewForViewport)
  tracker?.dispose(); tracker = null; stopCamera(video)
  events(controller.reset()); relief.dispose(); filters.dispose()
})
