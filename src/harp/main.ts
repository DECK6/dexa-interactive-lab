import { startHandLab } from '../lib/hand-lab'
import { HarpStrings, pullShape } from './strings'
import { harpLayout } from './layout'

startHandLab({
  title: '13 AIR HARP', slug: 'harp', hint: '현을 집어 당긴 뒤 놓으면 연주됩니다 · 두 손 간격으로 장력 조절 · 소리는 버튼으로 켜 주세요',
  create(canvas, _video, hud) {
    const ctx = canvas.getContext('2d')!
    const model = new HarpStrings()
    const controls = document.querySelector('.lab-controls')!
    const audioButton = document.createElement('button'); audioButton.type = 'button'; audioButton.dataset.action = 'audio'; audioButton.textContent = '소리 켜기'
    const volumeLabel = document.createElement('label'); volumeLabel.textContent = '음량'
    const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '0.4'; volume.step = '0.01'; volume.value = '0.16'; volume.setAttribute('aria-label', '음량')
    volumeLabel.append(volume); controls.append(audioButton, volumeLabel)
    let controlsHeight = 120
    const controlObserver = new ResizeObserver(entries => { controlsHeight = entries[0].borderBoxSize[0]?.blockSize ?? controls.clientHeight })
    controlObserver.observe(controls)
    let audio: AudioContext | null = null, master: GainNode | null = null, enabled = false
    const voices = new Set<OscillatorNode>()
    const stopVoices = () => { for (const o of voices) { try { o.stop() } catch { /* already stopped */ } o.disconnect() } voices.clear() }
    audioButton.addEventListener('click', async () => {
      try {
        if (!audio) { audio = new AudioContext(); master = audio.createGain(); master.gain.value = Number(volume.value); master.connect(audio.destination) }
        await audio.resume(); enabled = !enabled
        if (!enabled) stopVoices()
        audioButton.textContent = enabled ? '소리 끄기' : '소리 켜기'
        audioButton.setAttribute('aria-pressed', String(enabled))
      } catch { hud.flash('소리를 시작하지 못했습니다') }
    })
    volume.addEventListener('input', () => { if (master && audio) master.gain.setTargetAtTime(Number(volume.value), audio.currentTime, 0.03) })
    let noteCount = 0
    const names = ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4']
    return {
      frame(f) {
        const { width: w, height: h } = f
        const { top, bottom, spread, x0 } = harpLayout(w, h, controlsHeight)
        const notes = model.update(f.hands.map(hand => ({ ...hand, x: 0.2 + (hand.x * w - x0) / spread * 0.6, y: 0.22 + (hand.y * h - top) / (bottom - top) * 0.54 })), f.dt)
        for (const n of notes) {
          noteCount++
          if (!enabled || !audio || !master) continue
          if (voices.size >= 14) { const old = voices.values().next().value!; old.stop(); voices.delete(old) }
          const oscillator = audio.createOscillator(), envelope = audio.createGain()
          const now = audio.currentTime
          oscillator.type = 'triangle'; oscillator.frequency.value = 440 * 2 ** ((n.midi - 69) / 12)
          envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(n.velocity * 0.7, now + 0.006); envelope.gain.exponentialRampToValueAtTime(0.001, now + 1.4)
          oscillator.connect(envelope); envelope.connect(master); oscillator.start(); oscillator.stop(now + 1.5)
          voices.add(oscillator); oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect() }
        }
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0)
        ctx.fillStyle = '#101019'; ctx.fillRect(0, 0, w, h)
        const halo = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, w * 0.55)
        halo.addColorStop(0, '#2b2543'); halo.addColorStop(0.6, '#181827'); halo.addColorStop(1, '#101019'); ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = '#817066'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(x0 - 25, bottom); ctx.lineTo(x0 - 25, top - 28); ctx.bezierCurveTo(w * 0.33, top - 110, w * 0.64, top + 30, x0 + spread + 25, top - 28); ctx.lineTo(x0 + spread + 25, bottom); ctx.stroke()
        ctx.strokeStyle = '#d9b991'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0 - 35, bottom); ctx.lineTo(x0 + spread + 35, bottom); ctx.stroke()
        ctx.textAlign = 'center'; ctx.font = '11px "JetBrains Mono", monospace'
        for (let i = 0; i < 7; i++) {
          const x = x0 + spread * i / 6, energy = model.energy[i], pull = model.pulls[i] * spread / 0.6
          const color = i % 2 ? '#ffbd8e' : '#94e7f5'
          ctx.strokeStyle = color; ctx.lineWidth = 1.1 + energy * 2; ctx.shadowColor = color; ctx.shadowBlur = 5 + energy * 24
          ctx.beginPath()
          for (let j = 0; j <= 90; j++) {
            const u = j / 90, y = top + (bottom - top) * u
            const centre = (model.centres[i] - 0.22) / 0.54
            const shape = pullShape(u, centre)
            const dx = pull * shape + Math.sin(u * Math.PI) * Math.sin(u * 28 - f.t * (36 + i * 3)) * energy * 25
            if (!j) ctx.moveTo(x + dx, y); else ctx.lineTo(x + dx, y)
          }
          ctx.stroke(); ctx.shadowBlur = 0
          ctx.fillStyle = energy > 0.1 ? color : '#797686'; ctx.fillText(names[i], x, bottom + 32)
          ctx.beginPath(); ctx.arc(x, top, 3, 0, Math.PI * 2); ctx.fill()
        }
        for (const hand of f.hands) {
          ctx.strokeStyle = hand.pinch ? '#ffb889' : '#93dce8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hand.x * w, hand.y * h, hand.pinch ? 7 : 15, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.fillStyle = '#767080'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillText(`TENSION ${model.tension.toFixed(2)} / ${enabled ? 'SOUND ON' : 'SILENT PREVIEW'}`, w / 2, bottom + 58)
        canvas.dataset.plucks = String(noteCount); canvas.dataset.audio = String(enabled)
      },
      reset() { model.reset(); stopVoices(); noteCount = 0 },
      dispose() { controlObserver.disconnect(); stopVoices(); void audio?.close() },
    }
  },
})
