import * as THREE from 'three'
import { startHandLab } from '../lib/hand-lab'
import { createOpticalInstallation } from './scene'

startHandLab({
  title: '09 LIGHT CHAMBER',
  slug: 'optics',
  hint: '한 손은 광원 · 두 번째 손은 반사판 · 마우스 이동 / 누른 채 이동으로 반사판 회전',
  create(canvas, _video, hud) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor(0x080d11)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0x9cdbe3, 0x080a10, 2.5))
    const light = new THREE.DirectionalLight(0xbcecf1, 3)
    light.position.set(1, 3, 2)
    scene.add(light)
    const installation = createOpticalInstallation()
    scene.add(installation.group)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30)
    camera.position.set(3.4, 2.5, 4.7)
    camera.lookAt(0, -0.08, -0.08)
    const label = document.createElement('div')
    label.className = 'lab-readout'
    label.style.whiteSpace = 'pre-line'
    hud.el.append(label)
    let sourceId: string | null = null
    return {
      frame(f) {
        if (f.hands.length) {
          if (!sourceId || !f.hands.some(h => h.id === sourceId)) sourceId = f.hands[0].id
          const source = f.hands.find(h => h.id === sourceId)!
          const second = f.hands.find(h => h.id !== sourceId)
          if (f.pointer && source.pinch && !second) installation.setMirror((source.x - 0.5) * 2.5, (source.y - 0.5) * 0.9)
          else installation.setSource(source.x, source.y)
          if (second) installation.setMirror((second.x - 0.5) * 2.5, (second.y - 0.5) * 0.9)
        }
        installation.update(f.t)
        label.textContent = `LIGHT → MIRROR → RECEIVER\n${String(installation.reflectionCount).padStart(3, '0')} REFLECTED SEGMENTS\n${f.pointer ? 'MOVE · 광원   DRAG · 반사판   SHIFT · 양손' : 'FIRST HAND · 광원   SECOND HAND · 반사판'}`
        renderer.render(scene, camera)
      },
      resize(w, h) {
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.fov = w < h ? 53 : 38
        camera.updateProjectionMatrix()
      },
      reset() { installation.reset(); sourceId = null },
      dispose() { installation.dispose(); renderer.dispose(); label.remove() },
    }
  },
})
