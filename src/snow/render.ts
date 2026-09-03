import type { Flakes } from './flakes'

export interface SnowRenderFrame {
  video: HTMLVideoElement
  flakes: Flakes
  w: number
  h: number
  dpr: number
  presence: number
}

export interface SnowRenderer {
  updateMask(data: Float32Array, width: number, height: number): void
  draw(frame: SnowRenderFrame): void
}

const INK = '#0D0E10'
const CYAN_RGB = [94, 231, 243] as const
const SPRITE_SIZE = 64

const createFlakeSprite = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const center = SPRITE_SIZE / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(247, 250, 252, 1)')
  gradient.addColorStop(0.18, 'rgba(247, 250, 252, 0.96)')
  gradient.addColorStop(0.48, 'rgba(94, 231, 243, 0.42)')
  gradient.addColorStop(1, 'rgba(94, 231, 243, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
  return canvas
}

const drawMirroredCover = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  w: number,
  h: number,
): void => {
  if (sourceW <= 0 || sourceH <= 0) return
  const scale = Math.max(w / sourceW, h / sourceH)
  const drawW = sourceW * scale
  const drawH = sourceH * scale
  const x = (w - drawW) / 2
  const y = (h - drawH) / 2

  ctx.save()
  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(source, x, y, drawW, drawH)
  ctx.restore()
}

export function createSnowRenderer(ctx: CanvasRenderingContext2D): SnowRenderer {
  const maskCanvas = document.createElement('canvas')
  let maskCtx = maskCanvas.getContext('2d') as CanvasRenderingContext2D
  let maskImage: ImageData | null = null
  const flakeSprite = createFlakeSprite()

  return {
    updateMask(data: Float32Array, width: number, height: number): void {
      if (width <= 0 || height <= 0 || data.length !== width * height) return
      if (maskCanvas.width !== width || maskCanvas.height !== height || !maskImage) {
        maskCanvas.width = width
        maskCanvas.height = height
        maskCtx = maskCanvas.getContext('2d') as CanvasRenderingContext2D
        maskImage = maskCtx.createImageData(width, height)
      }

      const pixels = maskImage.data
      for (let i = 0, p = 0; i < data.length; i++, p += 4) {
        const confidence = Math.min(1, Math.max(0, data[i]))
        pixels[p] = CYAN_RGB[0]
        pixels[p + 1] = CYAN_RGB[1]
        pixels[p + 2] = CYAN_RGB[2]
        pixels[p + 3] = Math.round(confidence * 25.5)
      }
      maskCtx.putImageData(maskImage, 0, 0)
    },

    draw(frame: SnowRenderFrame): void {
      const { video, flakes, w, h, dpr, presence } = frame
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = INK
      ctx.fillRect(0, 0, w, h)

      if (video.readyState >= 2) {
        drawMirroredCover(ctx, video, video.videoWidth, video.videoHeight, w, h)
        ctx.fillStyle = 'rgba(13, 14, 16, 0.65)'
        ctx.fillRect(0, 0, w, h)
      }

      if (maskImage && presence > 0.001) {
        ctx.globalAlpha = presence
        drawMirroredCover(ctx, maskCanvas, maskCanvas.width, maskCanvas.height, w, h)
      }

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.78
      for (let i = 0; i < flakes.n; i++) {
        if (flakes.resting[i]) continue
        const size = flakes.r[i] * dpr * 4.2
        ctx.drawImage(flakeSprite, flakes.x[i] - size / 2, flakes.y[i] - size / 2, size, size)
      }

      ctx.globalAlpha = 0.96
      for (let i = 0; i < flakes.n; i++) {
        if (!flakes.resting[i]) continue
        const size = flakes.r[i] * dpr * 4.2
        ctx.drawImage(flakeSprite, flakes.x[i] - size / 2, flakes.y[i] - size / 2, size, size)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    },
  }
}
