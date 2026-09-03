import type { Board, InkColor, Stroke } from './ink'

const INK = '#0D0E10'
const CYAN = '#5EE7F3'
const ORANGE = '#FF5A1F'
const KEY2 = '#3A3B3F'
const WHITE = '#F7FAFC'

const colorFor = (color: InkColor): string => color === 'cyan' ? CYAN : ORANGE

export interface PenCursor {
  x: number
  y: number
  color: InkColor
  pinching: boolean
  holdProgress: number
}

export interface GraffitiFrame {
  width: number
  height: number
  dpr: number
  time: number
  presence: number
  dissolveAlpha: number
}

type StrokeLayer = 'glow' | 'solid'

function tracePath(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
}

function meanWidth(stroke: Stroke): number {
  let sum = 0
  for (const p of stroke.points) sum += p.w
  return sum / stroke.points.length
}

/** Variable-width pass: one opaque segment per point pair, so overlaps never band. */
function drawSegments(ctx: CanvasRenderingContext2D, stroke: Stroke, alpha: number, color: string): void {
  const points = stroke.points
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    ctx.lineWidth = (a.w + b.w) * 0.5
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

/**
 * Translucent passes trace the whole stroke as one path at its mean width —
 * per-segment round caps would double up alpha at every joint and scallop
 * the glow, and one stroke() call is far cheaper than hundreds.
 */
function drawStrokeLayer(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  layer: StrokeLayer,
  alpha = 1,
): void {
  if (stroke.points.length < 2) return
  const color = colorFor(stroke.color)
  const mean = meanWidth(stroke)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (layer === 'glow') {
    tracePath(ctx, stroke)
    ctx.strokeStyle = color
    ctx.lineWidth = mean * 4
    ctx.globalAlpha = alpha * 0.12
    ctx.stroke()
    ctx.lineWidth = mean * 2
    ctx.globalAlpha = alpha * 0.3
    ctx.stroke()
  } else {
    drawSegments(ctx, stroke, alpha, color)
    tracePath(ctx, stroke)
    ctx.strokeStyle = WHITE
    ctx.lineWidth = mean * 0.4
    ctx.globalAlpha = alpha * 0.6
    ctx.stroke()
  }
  ctx.restore()
}

function isActive(stroke: Stroke, active: readonly (Stroke | null)[]): boolean {
  for (const candidate of active) if (candidate === stroke) return true
  return false
}

function drawFeed(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, width, height)

  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
    const drawWidth = video.videoWidth * scale
    const drawHeight = video.videoHeight * scale
    const x = (width - drawWidth) * 0.5
    const y = (height - drawHeight) * 0.5
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, x, y, drawWidth, drawHeight)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  ctx.globalAlpha = 0.45
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  cursor: PenCursor,
  dpr: number,
  presence: number,
): void {
  const radius = (cursor.pinching ? 10 : 13) * dpr
  const color = colorFor(cursor.color)
  ctx.save()
  ctx.lineCap = 'round'

  if (cursor.pinching) {
    ctx.setLineDash([])
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.14 * presence
    ctx.lineWidth = 6 * dpr
    ctx.beginPath()
    ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.95 * presence
    ctx.lineWidth = 1.5 * dpr
    ctx.stroke()
  } else {
    ctx.setLineDash([3 * dpr, 3 * dpr])
    ctx.strokeStyle = KEY2
    ctx.globalAlpha = 0.7 * presence
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (cursor.holdProgress > 0) {
    ctx.setLineDash([])
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.95 * presence
    ctx.lineWidth = 3 * dpr
    ctx.beginPath()
    ctx.arc(
      cursor.x,
      cursor.y,
      radius + 6 * dpr,
      -Math.PI * 0.5,
      -Math.PI * 0.5 + Math.PI * 2 * cursor.holdProgress,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/** Caches completed glow and solid layers; only active strokes are redrawn each frame. */
export class GraffitiRenderer {
  private readonly glowCanvas = document.createElement('canvas')
  private readonly solidCanvas = document.createElement('canvas')
  private readonly glowCtx = this.glowCanvas.getContext('2d') as CanvasRenderingContext2D
  private readonly solidCtx = this.solidCanvas.getContext('2d') as CanvasRenderingContext2D
  private readonly cached: Stroke[] = []

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  private resizeCache(width: number, height: number): void {
    if (this.glowCanvas.width === width && this.glowCanvas.height === height) return
    this.glowCanvas.width = width
    this.glowCanvas.height = height
    this.solidCanvas.width = width
    this.solidCanvas.height = height
    this.cached.length = 0
  }

  private cacheStroke(stroke: Stroke): void {
    // Bake 110% glow so a 0.9..1.1 pulse can be applied at composite time.
    drawStrokeLayer(this.glowCtx, stroke, 'glow', 1.1)
    drawStrokeLayer(this.solidCtx, stroke, 'solid')
    this.cached.push(stroke)
  }

  private rebuildCache(board: Board, active: readonly (Stroke | null)[]): void {
    this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height)
    this.solidCtx.clearRect(0, 0, this.solidCanvas.width, this.solidCanvas.height)
    this.cached.length = 0
    for (const stroke of board.strokes) {
      if (!isActive(stroke, active) && stroke.points.length >= 2) this.cacheStroke(stroke)
    }
  }

  private syncCache(board: Board, active: readonly (Stroke | null)[]): void {
    let completedCount = 0
    let mismatch = false
    for (const stroke of board.strokes) {
      if (isActive(stroke, active) || stroke.points.length < 2) continue
      if (completedCount < this.cached.length && this.cached[completedCount] !== stroke) mismatch = true
      completedCount++
    }
    if (completedCount < this.cached.length) mismatch = true

    if (mismatch) {
      this.rebuildCache(board, active)
      return
    }
    if (completedCount === this.cached.length) return

    let seen = 0
    for (const stroke of board.strokes) {
      if (isActive(stroke, active) || stroke.points.length < 2) continue
      if (seen >= this.cached.length) this.cacheStroke(stroke)
      seen++
    }
  }

  render(
    video: HTMLVideoElement,
    board: Board,
    active: readonly (Stroke | null)[],
    cursors: readonly PenCursor[],
    frame: GraffitiFrame,
  ): void {
    this.resizeCache(frame.width, frame.height)
    this.syncCache(board, active)
    drawFeed(this.ctx, video, frame.width, frame.height)

    const pulse = 1 + Math.sin(frame.time * Math.PI) * 0.1
    this.ctx.save()
    this.ctx.globalAlpha = frame.dissolveAlpha * pulse / 1.1
    this.ctx.drawImage(this.glowCanvas, 0, 0)
    this.ctx.globalAlpha = frame.dissolveAlpha
    this.ctx.drawImage(this.solidCanvas, 0, 0)
    this.ctx.restore()

    for (const stroke of active) {
      if (!stroke) continue
      drawStrokeLayer(this.ctx, stroke, 'glow', frame.dissolveAlpha * pulse)
      drawStrokeLayer(this.ctx, stroke, 'solid', frame.dissolveAlpha)
    }

    for (const cursor of cursors) drawCursor(this.ctx, cursor, frame.dpr, frame.presence)
  }
}
