import { startHandLab } from '../lib/hand-lab'
import { Growth } from './sim'
import { GrowthRenderer } from './render'

startHandLab({
  title: '11 GROWTH', slug: 'growth',
  hint: '집어서 먹이를 놓으세요 · 두 번째 손으로 장벽을 움직이면 길이 돌아갑니다 · 최대 6개',
  create(canvas, _video, hud) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is not available')
    const mobile = window.innerWidth < 640
    const sim = new Growth({ width: mobile ? 180 : 288, height: mobile ? 240 : 180, count: mobile ? 4400 : 6400 })
    const renderer = new GrowthRenderer(ctx, sim)
    // A real simulation pre-roll gives first-time visitors a living starting specimen.
    const warmup = () => { for (let i = 0; i < 100; i++) sim.step(1 / 60) }
    warmup()
    let barrierMode = false
    let suppressSecondHand = false
    const events = new AbortController()
    const controls = document.querySelector('.lab-controls')
    const mode = document.createElement('button')
    mode.type = 'button'; mode.textContent = '장벽 이동'; mode.setAttribute('aria-pressed', 'false')
    mode.addEventListener('click', () => {
      barrierMode = !barrierMode; mode.setAttribute('aria-pressed', String(barrierMode))
      mode.textContent = barrierMode ? '먹이 배치로 전환' : '장벽 이동'
      hud.flash(barrierMode ? '손을 움직여 장벽 배치' : '집어서 먹이 배치')
    }, { signal: events.signal })
    const clear = document.createElement('button')
    clear.type = 'button'; clear.textContent = '장벽 지우기'
    clear.addEventListener('click', () => { sim.setBarrier(null); suppressSecondHand = true; barrierMode = false; mode.textContent = '장벽 이동'; mode.setAttribute('aria-pressed', 'false') }, { signal: events.signal })
    controls?.insertBefore(mode, controls.querySelector('.lab-input-status'))
    controls?.insertBefore(clear, controls.querySelector('.lab-input-status'))
    return {
      frame(f) {
        const primary = f.hands[0], second = f.hands[1]
        if (!second || second.justPinched) suppressSecondHand = false
        const wallHand = barrierMode ? primary : suppressSecondHand ? undefined : second
        if (primary?.justPinched && !barrierMode) { sim.addFood(primary.x, primary.y); hud.flash(`먹이 ${sim.food.length}/6`) }
        if (wallHand) sim.setBarrier({ x: wallHand.x, y: wallHand.y, angle: wallHand.angle + Math.PI * .5, length: .36 })
        sim.step(f.dt)
        renderer.draw(sim, f, barrierMode)
      },
      reset() { sim.reset(); warmup(); suppressSecondHand = false; barrierMode = false; mode.textContent = '장벽 이동'; mode.setAttribute('aria-pressed', 'false') },
      dispose() { events.abort(); mode.remove(); clear.remove() },
    }
  },
})
