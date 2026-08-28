// Canvas-2D stage and robot-puppet drawing. All geometry comes from the
// physics rig; this file only decides what it looks like.
import type { Puppet, StringTarget, Vec2 } from './puppet'
import { STRINGS } from './puppet'

export interface Theme {
  cyan: string
  orange: string
  key: string
  key2: string
  display: string
  text: string
}

/** Colors come from the DEXA token sheet, not from literals scattered here. */
export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  return {
    cyan: token('--cyan', '#5EE7F3'),
    orange: token('--orange', '#FF5A1F'),
    key: token('--ink-key', '#2A2B2E'),
    key2: token('--ink-key2', '#3A3B3F'),
    display: token('--ink-display', '#0D0E10'),
    text: token('--ink-text', '#8A8D93'),
  }
}

export interface SceneState {
  w: number
  h: number
  floorY: number
  size: number
  puppet: Puppet
  /** Screen-space fingertip anchors, or null while no hand is tracked. */
  anchors: Record<StringTarget, Vec2> | null
  /** 0..1 presence envelope — fades strings, control bar and the eye LEDs. */
  presence: number
  time: number
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function drawScene(ctx: CanvasRenderingContext2D, th: Theme, s: SceneState): void {
  const { w, h, floorY, size, puppet, anchors, presence, time } = s
  const j = puppet.joints

  ctx.clearRect(0, 0, w, h)

  // Stage: dotted grid, floor line, soft shadow under the puppet.
  ctx.fillStyle = th.key
  const grid = Math.max(48, size * 0.5)
  for (let gy = grid; gy < floorY; gy += grid)
    for (let gx = grid / 2; gx < w; gx += grid) ctx.fillRect(gx, gy, 2, 2)

  ctx.strokeStyle = th.key2
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, floorY + 0.5)
  ctx.lineTo(w, floorY + 0.5)
  ctx.stroke()

  const pelvis = mid(j.lHip, j.rHip)
  const spread = Math.max(Math.abs(j.lFoot.x - j.rFoot.x), size * 0.35)
  const grounded = Math.min(Math.max((pelvis.y - (floorY - size)) / size + 0.35, 0.15), 0.8)
  ctx.save()
  ctx.translate(pelvis.x, floorY)
  ctx.scale(1, 0.22)
  ctx.beginPath()
  ctx.arc(0, 0, spread * (0.6 + grounded * 0.5), 0, Math.PI * 2)
  ctx.fillStyle = `rgba(0,0,0,${0.25 + grounded * 0.3})`
  ctx.fill()
  ctx.restore()

  // Strings + control bar, faded by presence.
  if (anchors && presence > 0.01) {
    ctx.save()
    ctx.globalAlpha = presence

    ctx.strokeStyle = th.key2
    ctx.lineWidth = 1
    ctx.beginPath()
    STRINGS.forEach((t, i) => {
      const a = anchors[t]
      i === 0 ? ctx.moveTo(a.x, a.y) : ctx.lineTo(a.x, a.y)
    })
    ctx.stroke()

    for (const t of STRINGS) {
      const a = anchors[t]
      const p = j[t]
      const taut = puppet.tension[t] > 0.985
      ctx.strokeStyle = taut ? `rgba(94,231,243,0.45)` : `rgba(138,141,147,0.28)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      if (taut) {
        ctx.lineTo(p.x, p.y)
      } else {
        // Slack rope sags by the unused length.
        const sag = (1 - puppet.tension[t]) * puppet.stringLen[t] * 0.6
        ctx.quadraticCurveTo((a.x + p.x) / 2, (a.y + p.y) / 2 + sag, p.x, p.y)
      }
      ctx.stroke()

      ctx.fillStyle = th.cyan
      ctx.beginPath()
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // --- Robot puppet ---------------------------------------------------------
  const limb = (a: Vec2, b: Vec2): void => {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  const joint = (p: Vec2, r: number): void => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Limbs: dark capsule under a thin lit core.
  const limbW = size * 0.075
  for (const pass of [
    { color: th.key2, width: limbW },
    { color: '#4A4D54', width: limbW * 0.4 },
  ]) {
    ctx.strokeStyle = pass.color
    ctx.lineWidth = pass.width
    limb(j.lShoulder, j.lElbow)
    limb(j.lElbow, j.lHand)
    limb(j.rShoulder, j.rElbow)
    limb(j.rElbow, j.rHand)
    limb(j.lHip, j.lKnee)
    limb(j.lKnee, j.lFoot)
    limb(j.rHip, j.rKnee)
    limb(j.rKnee, j.rFoot)
  }

  // Neck, so the head reads as attached even while it swings.
  const neckTop = mid(j.lShoulder, j.rShoulder)
  ctx.strokeStyle = th.key2
  ctx.lineWidth = size * 0.055
  limb(neckTop, j.head)

  // Torso panel.
  ctx.fillStyle = th.key
  ctx.strokeStyle = '#4A4D54'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(j.lShoulder.x, j.lShoulder.y)
  ctx.lineTo(j.rShoulder.x, j.rShoulder.y)
  ctx.lineTo(j.rHip.x, j.rHip.y)
  ctx.lineTo(j.lHip.x, j.lHip.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Chest LED + vents, drawn in torso-local orientation.
  const chestTop = mid(j.lShoulder, j.rShoulder)
  const chest = mid(chestTop, pelvis)
  const tAngle = Math.atan2(pelvis.y - chestTop.y, pelvis.x - chestTop.x) - Math.PI / 2
  ctx.save()
  ctx.translate(chest.x, chest.y)
  ctx.rotate(tAngle)
  ctx.strokeStyle = th.key2
  ctx.lineWidth = 1.5
  for (let i = 0; i < 3; i++) {
    const vy = size * (0.02 + i * 0.045)
    ctx.beginPath()
    ctx.moveTo(-size * 0.08, vy)
    ctx.lineTo(size * 0.08, vy)
    ctx.stroke()
  }
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.4)
  ctx.fillStyle = th.orange
  ctx.globalAlpha = 0.35 + 0.65 * pulse
  ctx.beginPath()
  ctx.arc(0, -size * 0.08, size * 0.022, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()

  // Joints over limbs.
  ctx.fillStyle = '#54575E'
  const jr = size * 0.032
  for (const p of [j.lShoulder, j.rShoulder, j.lElbow, j.rElbow, j.lHip, j.rHip, j.lKnee, j.rKnee]) joint(p, jr)

  // Hands and feet.
  ctx.fillStyle = th.key2
  joint(j.lHand, size * 0.045)
  joint(j.rHand, size * 0.045)
  for (const [foot, knee] of [
    [j.lFoot, j.lKnee],
    [j.rFoot, j.rKnee],
  ] as const) {
    const a = Math.atan2(foot.y - knee.y, foot.x - knee.x) - Math.PI / 2
    ctx.save()
    ctx.translate(foot.x, foot.y)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.roundRect(-size * 0.05, -size * 0.02, size * 0.115, size * 0.05, size * 0.02)
    ctx.fill()
    ctx.restore()
  }

  // Head: oriented panel with LED eyes that light up while the hand drives.
  const neck = chestTop
  const hAngle = Math.atan2(j.head.y - neck.y, j.head.x - neck.x) + Math.PI / 2
  const hw = size * 0.19
  const hh = size * 0.165
  ctx.save()
  ctx.translate(j.head.x, j.head.y)
  ctx.rotate(hAngle)
  // Antenna.
  ctx.strokeStyle = th.key2
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, -hh / 2)
  ctx.lineTo(0, -hh / 2 - size * 0.06)
  ctx.stroke()
  ctx.fillStyle = th.orange
  ctx.beginPath()
  ctx.arc(0, -hh / 2 - size * 0.07, size * 0.016, 0, Math.PI * 2)
  ctx.fill()
  // Face plate.
  ctx.fillStyle = th.key
  ctx.strokeStyle = '#4A4D54'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(-hw / 2, -hh / 2, hw, hh, size * 0.035)
  ctx.fill()
  ctx.stroke()
  // Eyes: cyan LEDs, dimmed to embers when no hand holds the strings.
  const blink = Math.sin(time * 0.7) > 0.997 ? 0.15 : 1
  const eyeGlow = (0.12 + 0.88 * presence) * blink
  const eyeR = size * 0.026
  ctx.fillStyle = th.cyan
  ctx.globalAlpha = eyeGlow
  ctx.shadowColor = th.cyan
  ctx.shadowBlur = eyeR * 3 * presence
  ctx.beginPath()
  ctx.arc(-hw * 0.22, hh * 0.05, eyeR, 0, Math.PI * 2)
  ctx.arc(hw * 0.22, hh * 0.05, eyeR, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.restore()
}
