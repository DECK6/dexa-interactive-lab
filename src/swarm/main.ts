import { startHandLab } from '../lib/hand-lab'
import { Swarm } from './sim'
import { SwarmRenderer } from './render'

startHandLab({
  title: '10 SWARM', slug: 'swarm',
  hint: '천천히 움직이면 모이고, 빠르게 휘두르면 흩어집니다 · 두 손을 벌렸다 모아 보세요',
  create(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available')
    const sim = new Swarm({ count: window.innerWidth < 640 ? 320 : 520, width: window.innerWidth, height: window.innerHeight })
    const renderer = new SwarmRenderer(ctx)
    return {
      frame(f) { sim.step(f.dt, f.hands); renderer.draw(sim, f) },
      resize(w, h) { sim.resize(w, h) },
      reset() { sim.reset() },
    }
  },
})
