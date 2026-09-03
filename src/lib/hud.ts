import { CameraError } from './camera'
import type { CameraErrorKind } from './camera'

export interface Hud {
  el: HTMLElement
  setTracking(on: boolean): void
  setFps(n: number): void
  flash(text: string): void
}

export interface HudOpts {
  title: string
  sub: string
  hint: string
  /**
   * Enables the SNAPSHOT button (and the `S` key). Return the canvas to save —
   * WebGL canvases need `preserveDrawingBuffer: true` or a synchronous redraw
   * inside this callback. Return null when there is nothing worth saving.
   */
  snapshot?: () => HTMLCanvasElement | null
  /** File-name slug for snapshots, e.g. 'graffiti'. Defaults to the lower-cased title. */
  slug?: string
}

export function createHud(opts: HudOpts): Hud {
  const el = document.createElement('div')
  el.className = 'hud'
  el.innerHTML = `
    <div class="hud-chip hud-tl">
      <a class="wordmark" href="./">DEXA INTERACTIVE LAB<span class="dot">.</span></a>
      <span class="title">${opts.title}</span>
      <span>${opts.sub}</span>
    </div>
    <div class="hud-chip hud-tr">
      <span class="dot off"></span>
      <span class="hud-fps">-- FPS</span>
    </div>
    <div class="hud-chip hud-bc">${opts.hint}</div>
    <div class="hud-chip hud-flash"></div>
    ${opts.snapshot ? '<div class="hud-chip hud-br"><button class="snap" type="button">SNAPSHOT ⤓</button></div>' : ''}
  `

  const dot = el.querySelector('.hud-tr .dot') as HTMLElement
  const fps = el.querySelector('.hud-fps') as HTMLElement
  const flashEl = el.querySelector('.hud-flash') as HTMLElement
  let flashTimer: ReturnType<typeof setTimeout>

  const hud: Hud = {
    el,
    setTracking(on: boolean): void {
      dot.className = `dot ${on ? 'on' : 'off'}`
    },
    setFps(n: number): void {
      fps.textContent = `${Math.round(n)} FPS`
    },
    flash(text: string): void {
      flashEl.textContent = text
      flashEl.classList.add('on')
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => flashEl.classList.remove('on'), 800)
    },
  }

  if (opts.snapshot) {
    const slug = opts.slug ?? opts.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const take = (): void => {
      const src = opts.snapshot!()
      if (!src || !src.width) {
        hud.flash('NOTHING TO SAVE')
        return
      }
      saveSnapshot(src, slug)
      hud.flash('SAVED')
    }
    ;(el.querySelector('.snap') as HTMLButtonElement).addEventListener('click', take)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') take()
    })
  }

  return hud
}

/** Composites the DEXA wordmark onto a copy of `src` and triggers a PNG download. */
function saveSnapshot(src: HTMLCanvasElement, slug: string): void {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d') as CanvasRenderingContext2D
  ctx.drawImage(src, 0, 0)

  const scale = Math.max(1, out.width / 1200)
  const pad = 24 * scale
  const size = 15 * scale
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  ctx.font = `700 ${size}px "Space Grotesk", sans-serif`
  const dotW = ctx.measureText('.').width
  ctx.fillStyle = '#5EE7F3'
  ctx.fillText('.', out.width - pad, out.height - pad - size * 1.2)
  ctx.fillStyle = '#F7FAFC'
  ctx.fillText('DEXA INTERACTIVE LAB', out.width - pad - dotW, out.height - pad - size * 1.2)
  ctx.font = `400 ${10 * scale}px "JetBrains Mono", monospace`
  ctx.fillStyle = '#8A8D93'
  ctx.fillText('dexa.art/interactive', out.width - pad, out.height - pad)

  const d = new Date()
  const two = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
  out.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dexa-${slug}-${stamp}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

const CAMERA_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  denied: {
    title: '카메라 권한이 필요합니다',
    body: '주소창의 카메라 아이콘에서 권한을 허용한 뒤 새로고침해 주세요. 영상은 이 페이지 안에서만 처리되며 어디에도 전송되지 않습니다.',
  },
  notfound: {
    title: '카메라를 찾을 수 없습니다',
    body: '연결된 웹캠이 없거나 다른 앱이 사용 중입니다. 카메라를 연결하고 다른 앱을 종료한 뒤 새로고침해 주세요.',
  },
  insecure: {
    title: '보안 연결이 필요합니다',
    body: '카메라는 https 또는 localhost에서만 사용할 수 있습니다. https 주소로 다시 접속해 주세요.',
  },
}

/** Replaces the stage with a readable failure panel. Shared by both experiences. */
export function showCameraError(err: unknown): void {
  const kind: CameraErrorKind = err instanceof CameraError ? err.kind : 'notfound'
  const copy = CAMERA_COPY[kind]
  const panel = document.createElement('div')
  panel.className = 'cam-error'
  panel.innerHTML = `
    <div class="code">CAMERA / ${kind.toUpperCase()}</div>
    <h2>${copy.title}</h2>
    <p>${copy.body}</p>
    <a href="./">← DEXA INTERACTIVE LAB</a>
  `
  document.body.append(panel)
  console.warn('[camera]', err)
}
