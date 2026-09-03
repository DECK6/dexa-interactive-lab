#!/usr/bin/env node
// Bundle MediaPipe assets into public/ so the deployed site has no CDN dependency.
// Models are downloaded once (skipped if present); wasm is copied from node_modules every run.
import { mkdir, copyFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS_DIR = join(root, 'public/models')
const WASM_DIR = join(root, 'public/wasm')
const WASM_SRC = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')

const MODELS = [
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    file: 'selfie_segmenter.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  },
]

// FilesetResolver.forVisionTasks() only ever requests the simd / nosimd `_internal` pair.
// The `_module_` variants need supportsMultipleInputs=true, which we never pass — skip them (~11MB).
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const exists = (p) => stat(p).then(() => true, () => false)
const mb = (n) => `${(n / 1e6).toFixed(1)}MB`

await mkdir(MODELS_DIR, { recursive: true })
await mkdir(WASM_DIR, { recursive: true })

for (const { file, url } of MODELS) {
  const dest = join(MODELS_DIR, file)
  if (await exists(dest)) {
    console.log(`models: ${file} already present — skip`)
    continue
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(dest, buf)
  console.log(`models: downloaded ${file} (${mb(buf.length)})`)
}

if (!(await exists(WASM_SRC))) {
  throw new Error(`${WASM_SRC} not found — run 'bun install' first`)
}
for (const file of WASM_FILES) {
  await copyFile(join(WASM_SRC, file), join(WASM_DIR, file))
}
console.log(`wasm: copied ${WASM_FILES.length} files → public/wasm/`)
