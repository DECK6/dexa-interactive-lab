import * as THREE from 'three'
import { startHandLab } from '../lib/hand-lab'
import { ClothSim, boundClothTarget, type ClothGrab } from './sim'

startHandLab({
  title: '12 WEBCAM FABRIC', slug: 'cloth',
  hint: '천을 집어 당겼다가 놓아 보세요 · Shift 두 손 · 웹캠 연결 시 내 영상이 천이 됩니다',
  create(canvas, video) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor(0x10151b)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xcbefff, 0x25222d, 2.1))
    const light = new THREE.DirectionalLight(0xffe7c7, 3)
    light.position.set(-2, 3, 4); light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.left = -3; light.shadow.camera.right = 3
    light.shadow.camera.top = 3; light.shadow.camera.bottom = -3
    scene.add(light)
    const camera = new THREE.OrthographicCamera(-1.9, 1.9, 1.25, -1.25, 0.1, 20)
    camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0)
    const sim = new ClothSim()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(sim.positions, 3).setUsage(THREE.DynamicDrawUsage))
    const uv = new Float32Array(sim.cols * sim.rows * 2), indices: number[] = []
    for (let r = 0; r < sim.rows; r++) for (let c = 0; c < sim.cols; c++) {
      const i = r * sim.cols + c
      uv[i * 2] = 1 - c / (sim.cols - 1); uv[i * 2 + 1] = 1 - r / (sim.rows - 1)
      if (c + 1 < sim.cols && r + 1 < sim.rows) indices.push(i, i + sim.cols, i + 1, i + 1, i + sim.cols, i + sim.cols + 1)
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals()
    const pattern = document.createElement('canvas'); pattern.width = 768; pattern.height = 512
    const ctx = pattern.getContext('2d')!
    ctx.fillStyle = '#e4e3d8'; ctx.fillRect(0, 0, 768, 512)
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 768; x += 32) {
      ctx.fillStyle = (x / 32 + y / 32) % 2 ? '#324c5e' : '#152633'
      if (x < 220 || x > 550) ctx.fillRect(x, y, 30, 30)
    }
    ctx.fillStyle = '#ec6338'; ctx.fillRect(310, 0, 150, 512)
    ctx.save(); ctx.translate(384, 256); ctx.rotate(-Math.PI / 2); ctx.scale(-1, 1)
    ctx.fillStyle = '#151e27'; ctx.font = '900 115px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DEXA', 0, 40); ctx.restore()
    for (let y = 0; y < 512; y += 3) { ctx.fillStyle = '#ffffff14'; ctx.fillRect(0, y, 768, 1) }
    const preview = new THREE.CanvasTexture(pattern); preview.colorSpace = THREE.SRGBColorSpace
    const feed = new THREE.VideoTexture(video); feed.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshStandardMaterial({ map: preview, side: THREE.DoubleSide, roughness: 0.87, metalness: 0.04 })
    const cloth = new THREE.Mesh(geometry, material); cloth.castShadow = true; cloth.receiveShadow = true; scene.add(cloth)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x171f28, roughness: 0.96 }))
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.24; floor.receiveShadow = true; scene.add(floor)
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: 0x111b26 }))
    backdrop.position.z = -0.6; backdrop.receiveShadow = true; scene.add(backdrop)
    const pinGeo = new THREE.SphereGeometry(0.025, 12, 8), pinMat = new THREE.MeshBasicMaterial({ color: 0x5ee7f3 })
    for (const x of [-1.2, 1.2]) { const pin = new THREE.Mesh(pinGeo, pinMat); pin.position.set(x, 0.8, 0.03); scene.add(pin) }
    const grabs = new Map<string, number>()
    const cursors = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, 5, 24), new THREE.MeshBasicMaterial({ color: 0xffae81 })); scene.add(m); return m })
    let halfW = 1.9, halfH = 1.25
    return {
      resize(w, h) {
        halfH = Math.max(1.25, 1.55 * h / w); halfW = halfH * w / h
        camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH; camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(w, h, false)
      },
      frame(f) {
        const present = new Set(f.hands.filter(h => h.pinch).map(h => h.id))
        for (const key of grabs.keys()) if (!present.has(key)) grabs.delete(key)
        const targets: ClothGrab[] = []
        cursors.forEach(c => { c.visible = false })
        f.hands.forEach((hand, i) => {
          const x = (hand.x * 2 - 1) * halfW, y = (1 - hand.y * 2) * halfH
          if (hand.justPinched && !grabs.has(hand.id)) {
            const node = sim.grabAt(x, y, 0.22, new Set(grabs.values()))
            if (node !== null) grabs.set(hand.id, node)
          }
          const node = grabs.get(hand.id), target = boundClothTarget(x, y, 0.3)
          if (hand.pinch && node !== undefined) targets.push({ id: hand.id, node, ...target })
          if (cursors[i]) {
            cursors[i].visible = true
            cursors[i].position.set(node === undefined ? x : target.x, node === undefined ? y : target.y, 0.35)
            cursors[i].scale.setScalar(node === undefined ? 1 : 0.7)
          }
        })
        sim.step(f.dt, targets)
        geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals()
        const texture = !f.pointer && video.readyState >= 2 ? feed : preview
        if (material.map !== texture) { material.map = texture; material.needsUpdate = true }
        renderer.render(scene, camera)
        canvas.dataset.grabs = String(grabs.size)
      },
      reset() { grabs.clear(); sim.reset() },
      dispose() {
        scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose() } })
        preview.dispose(); feed.dispose(); renderer.dispose()
      },
    }
  },
})
