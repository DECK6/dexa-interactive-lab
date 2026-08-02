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

// How much of the measured head offset drives the projection axis. 1 = full
// physical parallax; installations usually want far less swing.
const GAIN_KEY = 'dexa-il.parallaxGain'
const GAIN_DEFAULT = 0.35

export function getParallaxGain(): number {
  const raw = Number(localStorage.getItem(GAIN_KEY))
  return Number.isFinite(raw) && raw > 0 ? raw : GAIN_DEFAULT
}

export function setParallaxGain(v: number): void {
  localStorage.setItem(GAIN_KEY, String(v))
}
