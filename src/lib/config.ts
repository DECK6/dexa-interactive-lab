// Physical width of the display, in metres. The off-axis projection is only
// correct if this roughly matches the real monitor, so it is user-adjustable.

const KEY = 'dexa-il.screenW'
const DEFAULT_M = 0.6

export function getScreenWidthM(): number {
  const raw = Number(localStorage.getItem(KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_M
}

export function setScreenWidthM(v: number): void {
  localStorage.setItem(KEY, String(v))
}
