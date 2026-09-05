import '../theme/dexa-theme.css'
import './hand-lab.css'
import { initCamera, stopCamera } from './camera'
import { createTwoHandTracker } from './tracking/hands2'
import { coverMap } from './cover'
import { createHud, type Hud } from './hud'
import { HandControls, type ControlPoint, type LabHand } from './hand-controls'
import { dockLabSnapshot, reloadOnPageRestore } from './lab-layout'
export type { LabHand } from './hand-controls'

export interface LabFrame {
  dt: number; t: number; width: number; height: number; hands: LabHand[]; pointer: boolean
}
export interface HandLabRenderer {
  frame(f: LabFrame): void
  resize?(w: number, h: number): void
  reset?(): void
  dispose?(): void
}
export interface HandLabOptions {
  title: string; slug: string; hint: string
  create(canvas: HTMLCanvasElement, video: HTMLVideoElement, hud: Hud): HandLabRenderer
}

/** Each page starts in explicitly labelled pointer preview; camera is opt-in and local. */
export function startHandLab(opts: HandLabOptions): void {
  reloadOnPageRestore()
  const canvas = document.querySelector<HTMLCanvasElement>('#stage')!
  canvas.style.touchAction = 'none'
  const video = document.querySelector<HTMLVideoElement>('#cam')!
  const hud = createHud({ title: opts.title, sub: 'PLAY / EXPLORE', hint: opts.hint, slug: opts.slug, snapshot: () => canvas })
  document.body.append(hud.el)
  const controls = document.createElement('div')
  controls.className = 'lab-controls'
  const previewCopy = matchMedia('(pointer: coarse)').matches ? '터치 체험 · 누른 채 움직여 보세요' : '마우스 체험 · 누르기: 핀치 · Shift: 두 손'
  controls.innerHTML = `<button type="button" data-action="camera">웹캠 연결</button><button type="button" data-action="reset">처음부터</button><span class="lab-input-status" role="status">${previewCopy}</span>`
  document.body.append(controls)
  const cameraButton = controls.querySelector<HTMLButtonElement>('[data-action="camera"]')!
  const reset = controls.querySelector<HTMLButtonElement>('[data-action="reset"]')!
  const status = controls.querySelector<HTMLElement>('.lab-input-status')!
  const input = new HandControls()
  let tracker: Awaited<ReturnType<typeof createTwoHandTracker>> | null = null
  let closed = false, busy = false, epoch = 0, raf = 0
  let width = innerWidth, height = innerHeight, last = performance.now(), fps = 60, elapsed = 0
  const mouse = { x: 0.5, y: 0.5, active: false, down: false, shift: false }
  const abort = new AbortController()
  const signal = abort.signal
  let renderer: HandLabRenderer
  try { renderer = opts.create(canvas, video, hud) } catch (error) {
    status.textContent = '이 브라우저에서 화면을 준비하지 못했습니다. 최신 Chrome에서 다시 열어 주세요.'
    cameraButton.disabled = true
    console.warn('[render initialization]', error)
    return
  }
  function resize(): void {
    dockLabSnapshot(hud.el, controls)
    width = Math.max(1, innerWidth); height = Math.max(1, innerHeight)
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    renderer.resize?.(width, height)
  }
  function endCamera(): void {
    tracker?.dispose(); tracker = null
    stopCamera(video); input.reset()
    cameraButton.textContent = '웹캠 연결'
    status.dataset.camera = 'false'
  }
  cameraButton.addEventListener('click', async () => {
    if (busy || closed) return
    if (tracker) {
      endCamera()
      status.textContent = previewCopy
      return
    }
    busy = true; cameraButton.disabled = true
    status.textContent = '카메라와 손 추적을 준비하고 있습니다…'
    const token = ++epoch
    try {
      await initCamera(video)
      if (closed || token !== epoch) { stopCamera(video); return }
      const ready = await createTwoHandTracker(video)
      if (closed || token !== epoch) { ready.dispose(); stopCamera(video); return }
      tracker = ready; input.reset(); mouse.down = false
      cameraButton.textContent = '마우스로 전환'
      status.dataset.camera = 'true'
      status.textContent = '웹캠 연결됨 · 손을 보여 주세요 · 영상은 이 기기에서만 처리됩니다'
    } catch (error) {
      endCamera()
      status.textContent = '카메라를 연결하지 못했습니다. 마우스로 계속 체험할 수 있습니다.'
      console.warn('[camera]', error)
    } finally { busy = false; cameraButton.disabled = closed }
  }, { signal })
  reset.addEventListener('click', () => { input.reset(); renderer.reset?.(); hud.flash('RESET') }, { signal })
  const setPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    mouse.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    mouse.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    mouse.active = true; mouse.shift = event.shiftKey
  }
  canvas.addEventListener('pointermove', setPointer, { signal })
  canvas.addEventListener('pointerdown', e => { setPointer(e); mouse.down = true; canvas.setPointerCapture(e.pointerId) }, { signal })
  canvas.addEventListener('pointerup', e => { setPointer(e); mouse.down = false }, { signal })
  canvas.addEventListener('pointercancel', () => { mouse.down = false; mouse.active = false }, { signal })
  canvas.addEventListener('pointerleave', () => { if (!mouse.down) mouse.active = false }, { signal })
  window.addEventListener('keydown', e => { if (e.key === 'Shift') mouse.shift = true }, { signal })
  window.addEventListener('keyup', e => { if (e.key === 'Shift') mouse.shift = false }, { signal })
  window.addEventListener('blur', () => { mouse.down = false; mouse.shift = false; mouse.active = false; input.reset() }, { signal })
  window.addEventListener('resize', resize, { signal })
  resize()
  const frame = (now: number): void => {
    if (closed) return
    const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000))
    last = now; elapsed += dt; fps += (1 / dt - fps) * 0.06
    const points: ControlPoint[] = []
    if (tracker) {
      try {
        const map = coverMap(video.videoWidth, video.videoHeight, width, height)
        const hands = tracker.read().hands
        for (const [i, hand] of hands.entries()) {
          const lm = hand.landmarks
          const a = map.toScreen(lm[4]), b = map.toScreen(lm[8])
          const wrist = map.toScreen(lm[0]), palm = map.toScreen(lm[9])
          const span = Math.max(1, Math.hypot(palm.x - wrist.x, palm.y - wrist.y))
          points.push({ id: `${hand.label || 'hand'}-${hands.filter(h => h.label === hand.label).length > 1 ? i : 0}`, x: (a.x + b.x) / (2 * width), y: (a.y + b.y) / (2 * height), ratio: Math.hypot(a.x - b.x, a.y - b.y) / span, angle: Math.atan2(palm.y - wrist.y, palm.x - wrist.x) })
        }
      } catch (error) {
        endCamera(); status.textContent = '손 추적이 중단되어 마우스 체험으로 전환했습니다.'
        console.warn('[tracking]', error)
      }
    } else if (mouse.active) {
      points.push({ id: 'pointer', x: mouse.x, y: mouse.y, ratio: mouse.down ? 0 : 1, angle: (mouse.x - 0.5) * Math.PI })
      if (mouse.shift) points.push({ id: 'pointer-2', x: 1 - mouse.x, y: 1 - mouse.y, ratio: mouse.down ? 0 : 1, angle: (0.5 - mouse.x) * Math.PI })
    }
    const hands = input.update(points, dt)
    renderer.frame({ dt, t: elapsed, width, height, hands, pointer: !tracker })
    hud.setTracking(!!tracker && hands.length > 0); hud.setFps(fps)
    canvas.dataset.input = tracker ? 'camera' : 'pointer'
    canvas.dataset.hands = String(hands.length)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  window.addEventListener('pagehide', () => {
    closed = true; epoch++; cancelAnimationFrame(raf); abort.abort(); endCamera(); renderer.dispose?.()
  }, { once: true })
}
