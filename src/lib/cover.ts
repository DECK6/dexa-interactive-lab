// Cover-crop mapping: the video fills the viewport, cropping whichever axis
// overflows. Shared by every experience that overlays tracking on the feed.
import type { Vec2 } from './math/quad'

export interface CoverMap {
  /** Visible fraction of the video along each axis (1 = fully visible). */
  coverX: number
  coverY: number
  /** Video-normalized (0..1) → canvas px. */
  toScreen(p: Vec2): Vec2
  /** Canvas px → video-normalized (may fall outside 0..1 for cropped regions). */
  toNorm(p: Vec2): Vec2
}

export function coverMap(videoW: number, videoH: number, canvasW: number, canvasH: number): CoverMap {
  const va = videoW > 0 && videoH > 0 ? videoW / videoH : 4 / 3
  const ca = canvasH > 0 ? canvasW / canvasH : va
  const wide = ca > va
  // Scale that makes the video cover the canvas, in px per normalized unit.
  const sx = wide ? canvasW : canvasH * va
  const sy = wide ? canvasW / va : canvasH
  const ox = (canvasW - sx) / 2
  const oy = (canvasH - sy) / 2
  return {
    coverX: wide ? 1 : ca / va,
    coverY: wide ? va / ca : 1,
    toScreen: (p) => ({ x: ox + p.x * sx, y: oy + p.y * sy }),
    toNorm: (p) => ({ x: (p.x - ox) / sx, y: (p.y - oy) / sy }),
  }
}
