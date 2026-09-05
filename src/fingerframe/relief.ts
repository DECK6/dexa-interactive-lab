import * as THREE from 'three'
import { bilinear, type Quad } from '../lib/math/quad'
import type { CapturePose, CapturedPiece } from './capture'

interface Sculpture { group: THREE.Group; surface: THREE.Mesh; texture: THREE.CanvasTexture; geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; created: number }

/** Freezes exactly the visible quadrilateral; no depth model or video buffer is retained. */
function freezePatch(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const patch = document.createElement('canvas')
  patch.width = 240; patch.height = 180
  const ctx = patch.getContext('2d')!
  const input = source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
  const out = ctx.createImageData(patch.width, patch.height)
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    const p = bilinear({ x: x / (patch.width - 1), y: y / (patch.height - 1) }, ...quad)
    const px = Math.max(0, Math.min(source.width - 1, Math.round(p.x * (source.width - 1))))
    const py = Math.max(0, Math.min(source.height - 1, Math.round(p.y * (source.height - 1))))
    const i = (py * source.width + px) * 4, o = (y * patch.width + x) * 4
    out.data[o] = input.data[i]; out.data[o + 1] = input.data[i + 1]; out.data[o + 2] = input.data[i + 2]; out.data[o + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return patch
}

export function createReliefRenderer(canvas: HTMLCanvasElement, source: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setClearColor('#0d0e10')
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3000)
  camera.position.z = 1200
  const ambient = new THREE.AmbientLight(0xffffff, 1.5)
  const key = new THREE.DirectionalLight(0xdffcff, 2.6)
  key.position.set(-500, 600, 800)
  const fill = new THREE.DirectionalLight(0xff7441, 1.3)
  fill.position.set(600, -180, 350)
  scene.add(ambient, key, fill)
  const feedTexture = new THREE.CanvasTexture(source)
  feedTexture.colorSpace = THREE.SRGBColorSpace
  const feedMaterial = new THREE.MeshBasicMaterial({ map: feedTexture, color: 0x626a70 })
  const feedGeometry = new THREE.PlaneGeometry(1, 1)
  const feed = new THREE.Mesh(feedGeometry, feedMaterial)
  feed.position.z = -150
  scene.add(feed)
  const sculptures = new Map<number, Sculpture>()
  let width = 1, height = 1
  const resize = () => {
    width = innerWidth; height = innerHeight
    renderer.setSize(width, height, false)
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    feed.scale.set(width, height, 1)
  }
  resize()
  const disposePiece = (id: number) => {
    const item = sculptures.get(id)
    if (!item) return
    scene.remove(item.group)
    item.texture.dispose()
    item.geometries.forEach(g => g.dispose())
    item.materials.forEach(m => m.dispose())
    sculptures.delete(id)
  }
  return {
    capture(id: number, quad: Quad, now: number) {
      const image = freezePatch(source, quad)
      const texture = new THREE.CanvasTexture(image)
      texture.colorSpace = THREE.SRGBColorSpace
      const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data
      const geometry = new THREE.PlaneGeometry(1, 1, 80, 60)
      const position = geometry.attributes.position
      const uv = geometry.attributes.uv
      const kernel = [1, 4, 6, 4, 1]
      for (let i = 0; i < position.count; i++) {
        const x = Math.round(uv.getX(i) * (image.width - 1))
        const y = Math.round((1 - uv.getY(i)) * (image.height - 1))
        // Remove pixel-scale ridges before displacement; the full-resolution color stays sharp.
        let luminance = 0
        for (let ky = -2; ky <= 2; ky++) for (let kx = -2; kx <= 2; kx++) {
          const sx = Math.max(0, Math.min(image.width - 1, x + kx))
          const sy = Math.max(0, Math.min(image.height - 1, y + ky))
          const offset = (sy * image.width + sx) * 4
          luminance += (pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114) * kernel[kx + 2] * kernel[ky + 2]
        }
        const brightness = luminance / (255 * 256)
        // Brightness-derived displacement only: a shallow, bounded virtual relief.
        position.setZ(i, .018 + Math.pow(brightness, 1.3) * .23)
      }
      geometry.computeVertexNormals()
      const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .65, metalness: .08 })
      const surface = new THREE.Mesh(geometry, material)
      const group = new THREE.Group()
      group.add(surface)
      const backingGeometry = new THREE.BoxGeometry(1.035, 1.045, .025)
      const backingMaterial = new THREE.MeshStandardMaterial({ color: '#12272b', metalness: .72, roughness: .27 })
      const backing = new THREE.Mesh(backingGeometry, backingMaterial)
      backing.position.z = -.016
      group.add(backing)
      const edgeGeometry = new THREE.EdgesGeometry(backingGeometry)
      const edgeMaterial = new THREE.LineBasicMaterial({ color: '#5ee7f3', transparent: true, opacity: .95 })
      const edge = new THREE.LineSegments(edgeGeometry, edgeMaterial)
      edge.position.z = -.016
      group.add(edge)
      // Three trailing registration outlines reveal that a flat image was lifted from its plane.
      const echoPlane = new THREE.PlaneGeometry(1, 1)
      const echoGeometry = new THREE.EdgesGeometry(echoPlane)
      echoPlane.dispose()
      const echoMaterial = new THREE.LineBasicMaterial({ color: '#5ee7f3', transparent: true, opacity: .22 })
      for (let i = 1; i <= 3; i++) {
        const layer = new THREE.LineSegments(echoGeometry, echoMaterial)
        layer.position.z = -i * .035
        group.add(layer)
      }
      scene.add(group)
      sculptures.set(id, { group, surface, texture, geometries: [geometry, backingGeometry, edgeGeometry, echoGeometry], materials: [material, backingMaterial, edgeMaterial, echoMaterial], created: now })
    },
    render(pieces: readonly CapturedPiece[], now: number, depth: number) {
      if (innerWidth !== width || innerHeight !== height) resize()
      feedTexture.needsUpdate = true
      for (const piece of pieces) {
        const item = sculptures.get(piece.id)
        if (!item) continue
        const p: CapturePose = piece.pose
        const reveal = Math.min(1, Math.max(0, (now - item.created) / .7))
        const lift = 1 - Math.pow(1 - reveal, 3)
        item.group.position.set((p.x - .5) * width, (.5 - p.y) * height, 30 + piece.id % 10)
        item.group.scale.set(p.width * width, p.height * height, p.height * height)
        item.group.rotation.set(-.28 * lift, p.tilt * lift, -p.roll)
        item.surface.scale.z = Math.max(.02, depth * lift)
      }
      renderer.render(scene, camera)
    },
    disposePiece,
    dispose() {
      for (const id of sculptures.keys()) disposePiece(id)
      feedTexture.dispose(); feedMaterial.dispose(); feedGeometry.dispose(); renderer.dispose()
    },
  }
}
