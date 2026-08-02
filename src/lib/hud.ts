import { CameraError } from './camera'
import type { CameraErrorKind } from './camera'

export interface Hud {
  el: HTMLElement
  setTracking(on: boolean): void
  setFps(n: number): void
  flash(text: string): void
}

export function createHud(opts: { title: string; sub: string; hint: string }): Hud {
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
  `

  const dot = el.querySelector('.hud-tr .dot') as HTMLElement
  const fps = el.querySelector('.hud-fps') as HTMLElement
  const flashEl = el.querySelector('.hud-flash') as HTMLElement
  let flashTimer: ReturnType<typeof setTimeout>

  return {
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
