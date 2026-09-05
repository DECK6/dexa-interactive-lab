import type { LabFrame } from '../lib/hand-lab'
import type { Growth } from './sim'

export class GrowthRenderer {
  private surface = document.createElement('canvas')
  private surfaceCtx: CanvasRenderingContext2D
  private image: ImageData
  constructor(private readonly ctx: CanvasRenderingContext2D, sim: Growth) {
    this.surface.width = sim.width; this.surface.height = sim.height
    this.surfaceCtx = this.surface.getContext('2d')!
    this.image = this.surfaceCtx.createImageData(sim.width, sim.height)
  }
  draw(sim: Growth, f: LabFrame, barrierMode: boolean) {
    const { ctx } = this, { width: w, height: h, t } = f
    ctx.setTransform(ctx.canvas.width / w, 0, 0, ctx.canvas.height / h, 0, 0)
    const pixels = this.image.data
    for (let i = 0; i < sim.trail.length; i++) {
      const v = Math.min(1, Math.pow(sim.trail[i] / 14, .8)), glow = Math.pow(v, 2.2)
      pixels[i * 4] = 4 + v * 146 + glow * 105
      pixels[i * 4 + 1] = 10 + v * 173 + glow * 64
      pixels[i * 4 + 2] = 8 + v * 55 + glow * 117
      pixels[i * 4 + 3] = 255
    }
    this.surfaceCtx.putImageData(this.image, 0, 0)
    ctx.fillStyle = '#040a08'; ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.surface, 0, 0, w, h)
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .3; ctx.filter = 'blur(12px)'
    ctx.drawImage(this.surface, 0, 0, w, h)
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    const shade = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .12, w / 2, h / 2, Math.max(w, h) * .65)
    shade.addColorStop(0, '#02070500'); shade.addColorStop(1, '#020705bb')
    ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#efffbe'; ctx.globalAlpha = .5
    for (let i = 0; i < sim.count; i += 6) ctx.fillRect(sim.agentX[i] / sim.width * w, sim.agentY[i] / sim.height * h, 1, 1)
    ctx.globalAlpha = 1
    if (sim.barrier) {
      const b = sim.barrier, half = (b.length ?? .3) * Math.min(sim.width, sim.height) * .5
      const dx = Math.cos(b.angle) * half / sim.width * w, dy = Math.sin(b.angle) * half / sim.height * h
      const x = b.x * w, y = b.y * h
      ctx.lineCap = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = '#171122'
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke()
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#e59dbd'; ctx.stroke()
      ctx.fillStyle = '#e59dbd'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'
      ctx.fillText('BARRIER', x, y - Math.abs(dy) - 18)
    }
    for (let i = 0; i < sim.food.length; i++) {
      const node = sim.food[i], x = node.x * w, y = node.y * h
      const pulse = 20 + Math.sin(t * 1.9 + i) * 3
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 55)
      halo.addColorStop(0, '#e7f3a64a'); halo.addColorStop(1, '#ddffaa00')
      ctx.fillStyle = halo; ctx.fillRect(x - 55, y - 55, 110, 110)
      ctx.strokeStyle = '#edffb380'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#e4ffbb'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#d4e5ad'
      ctx.fillText(`N${String(node.id + 1).padStart(2, '0')}`, x, y + 38)
    }
    if (f.hands[0]) {
      const hand = f.hands[0], x = hand.x * w, y = hand.y * h
      ctx.strokeStyle = barrierMode ? '#e59dbd' : '#e2f9b6'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(x, y, hand.pinch ? 10 : 16, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke()
    }
    const bottom = Math.max(160, h - (w < 640 ? 250 : 200))
    ctx.textAlign = 'left'; ctx.fillStyle = '#d0e49c99'; ctx.font = '10px "JetBrains Mono", monospace'
    ctx.fillText('PLACE THE CONDITIONS. WATCH THE PATHS.', 30, bottom)
    ctx.fillStyle = '#b2c08d77'
    ctx.fillText(`${sim.food.length}/6 NUTRIENTS  ·  ${String(Math.floor(sim.stats.ticks / 60)).padStart(3, '0')}s GROWING`, 30, bottom + 18)
  }
}
