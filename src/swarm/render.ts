import type { LabFrame } from '../lib/hand-lab'
import type { Swarm } from './sim'

export class SwarmRenderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}
  draw(sim: Swarm, f: LabFrame) {
    const { ctx } = this, { width: w, height: h, t } = f
    ctx.setTransform(ctx.canvas.width / w, 0, 0, ctx.canvas.height / h, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    const sea = ctx.createRadialGradient(w * .52, h * .49, 0, w * .52, h * .49, Math.max(w, h) * .75)
    sea.addColorStop(0, '#0d2932'); sea.addColorStop(.48, '#07161f'); sea.addColorStop(1, '#03080e')
    ctx.fillStyle = sea; ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = .6; ctx.strokeStyle = '#79c8c810'
    const space = 56
    ctx.beginPath()
    for (let x = w % space; x < w; x += space) for (let y = h % space; y < h; y += space) {
      ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + 2)
    }
    ctx.stroke()
    // A luminous habitat, not a copy of the camera silhouette.
    const palette = ['#bdf6dc', '#65d8d3', '#b2c4fe', '#f3d18c']
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const size = Math.max(.65, Math.min(1.15, w / 1100))
    for (let group = 0; group < palette.length; group++) {
      ctx.beginPath()
      for (let i = group; i < sim.agents.length; i += palette.length) {
        const a = sim.agents[i], speed = Math.hypot(a.vx, a.vy), ux = a.vx / speed, uy = a.vy / speed
        const length = (5.2 + (i % 5) * .4) * size
        const wiggle = Math.sin(t * (7 + speed * .035) + a.phase) * 2.8 * size
        ctx.moveTo(a.x + ux * length, a.y + uy * length)
        ctx.quadraticCurveTo(a.x - uy * 1.7 * size, a.y + ux * 1.7 * size,
          a.x - ux * length, a.y - uy * length)
        ctx.quadraticCurveTo(a.x - ux * length * 1.6 - uy * wiggle, a.y - uy * length * 1.6 + ux * wiggle,
          a.x - ux * length * 2.2, a.y - uy * length * 2.2)
      }
      ctx.strokeStyle = palette[group]; ctx.lineWidth = 1.4 * size; ctx.globalAlpha = .56; ctx.stroke()
      ctx.globalAlpha = .95; ctx.beginPath()
      for (let i = group; i < sim.agents.length; i += palette.length) {
        const a = sim.agents[i], speed = Math.hypot(a.vx, a.vy), ux = a.vx / speed, uy = a.vy / speed
        const length = 5 * size, fin = 1.9 * size
        ctx.moveTo(a.x + ux * length, a.y + uy * length)
        ctx.lineTo(a.x - ux * 2 - uy * fin, a.y - uy * 2 + ux * fin)
        ctx.lineTo(a.x - ux * 4, a.y - uy * 4)
        ctx.lineTo(a.x - ux * 2 + uy * fin, a.y - uy * 2 - ux * fin)
        ctx.closePath()
      }
      ctx.fillStyle = palette[group]; ctx.fill()
    }
    ctx.globalAlpha = 1
    f.hands.forEach((hand, i) => {
      const x = hand.x * w, y = hand.y * h, alarm = hand.speed > .85
      ctx.strokeStyle = alarm ? '#ffa57c' : '#8be9cd'
      ctx.lineWidth = 1; ctx.setLineDash([3, 7]); ctx.beginPath(); ctx.arc(x, y, alarm ? 55 : 31, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = alarm ? '#ffa57c' : '#c7f8e4'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'
      ctx.fillText(alarm ? 'SCATTER' : f.hands.length > 1 ? `SCHOOL ${i + 1}` : 'GATHER', x, y + 52)
    })
    ctx.textAlign = 'left'; ctx.fillStyle = '#9ccdcf80'; ctx.font = '10px "JetBrains Mono", monospace'
    const bottom = Math.max(160, h - (w < 640 ? 250 : 200))
    ctx.fillText('SLOW → GATHER     FAST → SCATTER', 30, bottom)
    ctx.fillStyle = '#77aaaa50'; ctx.fillText(`${sim.count} ORGANISMS / A SHARED INSTINCT`, 30, bottom + 18)
  }
}
