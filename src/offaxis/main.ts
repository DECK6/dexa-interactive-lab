// STUB — B2a replaces the render body with the three.js off-axis scene.
// Wiring (camera → tracker → HUD → rAF) and the failure path are final.
import '../theme/dexa-theme.css'
import { initCamera, stopCamera } from '../lib/camera'
import { createFaceTracker } from '../lib/tracking/face'
import { createHud, showCameraError } from '../lib/hud'
import { getScreenWidthM } from '../lib/config'

const canvas = document.getElementById('stage') as HTMLCanvasElement
const video = document.getElementById('cam') as HTMLVideoElement

async function main(): Promise<void> {
  const hud = createHud({
    title: '01 OFF-AXIS WINDOW',
    sub: 'HEAD-TRACKED',
    hint: '화면 앞에서 머리를 움직여 보세요',
  })
  document.body.append(hud.el)

  const debug = document.createElement('div')
  debug.className = 'hud-chip hud-debug'
  hud.el.append(debug)

  try {
    await initCamera(video)
  } catch (err) {
    showCameraError(err)
    return
  }

  const tracker = await createFaceTracker(video)
  addEventListener('pagehide', () => {
    tracker.dispose()
    stopCamera(video)
  })

  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
  const resize = (): void => {
    const dpr = Math.min(devicePixelRatio, 2)
    canvas.width = Math.round(innerWidth * dpr)
    canvas.height = Math.round(innerHeight * dpr)
  }
  resize()
  addEventListener('resize', resize)

  let last = performance.now()
  let fps = 60

  const loop = (): void => {
    const now = performance.now()
    fps += (1000 / Math.max(now - last, 1) - fps) * 0.1
    last = now

    const pose = tracker.read()

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.051, 0.055, 0.063, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    hud.setTracking(pose.present)
    hud.setFps(fps)
    debug.textContent =
      `head  x ${pose.x.toFixed(3)}  y ${pose.y.toFixed(3)}  z ${pose.z.toFixed(3)}\n` +
      `screen ${getScreenWidthM().toFixed(2)}m   ${pose.present ? 'TRACKING' : 'NO FACE'}`

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

void main()
