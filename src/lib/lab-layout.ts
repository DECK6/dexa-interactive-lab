/** Dock the existing snapshot action on narrow screens to leave the stage clear. */
export function dockLabSnapshot(hud: HTMLElement, controls: HTMLElement): void {
  const snapshot = hud.querySelector<HTMLElement>('.hud-br') ?? controls.querySelector<HTMLElement>('.hud-br')
  if (!snapshot) return
  const parent = innerWidth <= 600 ? controls : hud
  if (snapshot.parentElement !== parent) parent.append(snapshot)
}

/** pagehide releases GPU/camera resources; a cached return needs a fresh runtime. */
export function reloadOnPageRestore(): void {
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
}
