import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Chromium runs with --use-fake-device-for-media-stream (see playwright.config.ts),
// so getUserMedia succeeds but the stream is a rolling test pattern containing
// neither a face nor hands. Both experiences must therefore boot, load their
// models, and settle into the "not tracking" state without erroring.

const IGNORED_CONSOLE = [
  // The site ships no favicon, so Chromium's automatic /favicon.ico 404 is expected.
  /favicon\.ico/,
  // The MediaPipe wasm runtime writes every log level to stderr, which Emscripten
  // maps onto console.error — so its own level prefix is the only way to tell an
  // informational line (e.g. the XNNPACK CPU delegate notice raised when the
  // headless GPU delegate is unavailable) from a real failure.
  /^INFO: /,
]

interface Watch {
  errors: string[]
  requests: string[]
}

function watch(page: Page): Watch {
  const w: Watch = { errors: [], requests: [] }
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (IGNORED_CONSOLE.some((rx) => rx.test(text))) return
    w.errors.push(text)
  })
  page.on('pageerror', (err) => w.errors.push(`pageerror: ${err.message}`))
  page.on('request', (req) => w.requests.push(req.url()))
  return w
}

/**
 * The fps chip reads '-- FPS' until the first render frame, and the first frame
 * only happens after the camera and the MediaPipe landmarker are both up — so
 * this is the readiness signal for "the experience is actually running".
 * Model init takes a few seconds on a cold wasm load.
 */
async function waitForRenderLoop(page: Page): Promise<void> {
  await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/, { timeout: 30_000 })
}

/** Models and wasm are bundled under public/, never pulled from the MediaPipe CDN. */
function expectSameOriginAssets(page: Page, w: Watch): void {
  expect(w.requests.filter((u) => u.includes('storage.googleapis.com'))).toEqual([])
  const assets = w.requests.filter((u) => /\/(models\/[\w-]+\.(task|tflite)|wasm\/vision_wasm)/.test(u))
  expect(assets.length).toBeGreaterThan(0)
  const origin = new URL(page.url()).origin
  expect(assets.filter((u) => !u.startsWith(origin))).toEqual([])
}

test('landing page offers all thirteen experiences', async ({ page }) => {
  const w = watch(page)
  await page.goto('./')

  await expect(page).toHaveTitle(/DEXA INTERACTIVE LAB/)
  await expect(page.locator('.lab-head .wordmark')).toBeVisible()

  const cards = page.locator('.lab-card')
  const hrefs = [
    './offaxis.html',
    './fingerframe.html',
    './puppet.html',
    './echo.html',
    './dust.html',
    './fluid.html',
    './graffiti.html',
    './snow.html',
    './optics.html',
    './swarm.html',
    './growth.html',
    './cloth.html',
    './harp.html',
  ]
  await expect(cards).toHaveCount(hrefs.length)
  for (const [i, href] of hrefs.entries()) {
    await expect(cards.nth(i)).toBeVisible()
    await expect(cards.nth(i)).toHaveAttribute('href', href)
  }
  await expect(page.locator('.lab-privacy')).toBeVisible()

  expect(w.errors).toEqual([])
})

test('01 off-axis window boots and reports no face', async ({ page }) => {
  const w = watch(page)
  await page.goto('offaxis.html')

  await expect(page.locator('canvas#stage')).toBeVisible()
  await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
  await expect(page.locator('.hud-bc')).toContainText('머리를 움직여')

  await page.locator('[data-action="camera"]').click()
  await expect(page.locator('canvas#stage')).toHaveAttribute('data-input', 'camera', { timeout: 30_000 })

  await waitForRenderLoop(page)
  // Written by the loop from the tracker's own pose, not by the initial markup.
  await expect(page.locator('.hud-debug')).toContainText('NO FACE')
  await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)

  expectSameOriginAssets(page, w)
  expect(w.errors).toEqual([])
})

test('03 marionette boots and reports no hand', async ({ page }) => {
  const w = watch(page)
  await page.goto('puppet.html')

  await expect(page.locator('canvas#stage')).toBeVisible()
  await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
  await expect(page.locator('.hud-bc')).toContainText('손바닥을 펴서')

  await waitForRenderLoop(page)
  await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)

  expectSameOriginAssets(page, w)
  expect(w.errors).toEqual([])
})

test('02 finger frame boots and reports no hands', async ({ page }) => {
  const w = watch(page)
  await page.goto('fingerframe.html')

  await expect(page.locator('canvas#relief-stage')).toBeVisible()
  await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
  await expect(page.locator('.hud-bc')).toContainText('사각형을 만들어 보세요')

  await page.locator('[data-action="camera"]').click()
  await expect(page.locator('[data-readout="input"]')).toContainText('라이브 카메라', { timeout: 30_000 })

  await waitForRenderLoop(page)
  await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)

  expectSameOriginAssets(page, w)
  expect(w.errors).toEqual([])
})

// v2 experiences. The segmentation pages skip the tracking-dot assertion: the
// fake device's colour-bar pattern may register as a sliver of "person".
const V2: { title: string; url: string; hint: string; hasDot: boolean }[] = [
  { title: '04 time echo', url: 'echo.html', hint: '움직여 보세요', hasDot: false },
  { title: '05 dust face', url: 'dust.html', hint: '입을 벌리면', hasDot: true },
  { title: '06 neon fluid', url: 'fluid.html', hint: '허공을 저어', hasDot: true },
  { title: '07 air graffiti', url: 'graffiti.html', hint: '허공에 그려', hasDot: true },
  { title: '08 snowfall', url: 'snow.html', hint: '어깨 위에', hasDot: false },
]

for (const exp of V2) {
  test(`${exp.title} boots on the fake camera`, async ({ page }) => {
    const w = watch(page)
    await page.goto(exp.url)

    await expect(page.locator('canvas#stage')).toBeVisible()
    await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
    await expect(page.locator('.hud-bc')).toContainText(exp.hint)

    await waitForRenderLoop(page)
    if (exp.hasDot) await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)

    expectSameOriginAssets(page, w)
    expect(w.errors).toEqual([])
  })
}
