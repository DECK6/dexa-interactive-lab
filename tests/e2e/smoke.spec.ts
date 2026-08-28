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
  const assets = w.requests.filter((u) => /\/(models\/[\w-]+\.task|wasm\/vision_wasm)/.test(u))
  expect(assets.length).toBeGreaterThan(0)
  const origin = new URL(page.url()).origin
  expect(assets.filter((u) => !u.startsWith(origin))).toEqual([])
}

test('landing page offers both experiences', async ({ page }) => {
  const w = watch(page)
  await page.goto('./')

  await expect(page).toHaveTitle(/DEXA INTERACTIVE LAB/)
  await expect(page.locator('.lab-head .wordmark')).toBeVisible()

  const cards = page.locator('.lab-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toBeVisible()
  await expect(cards.nth(1)).toBeVisible()
  await expect(cards.nth(2)).toBeVisible()
  await expect(cards.nth(0)).toHaveAttribute('href', './offaxis.html')
  await expect(cards.nth(1)).toHaveAttribute('href', './fingerframe.html')
  await expect(cards.nth(2)).toHaveAttribute('href', './puppet.html')
  await expect(page.locator('.lab-privacy')).toBeVisible()

  expect(w.errors).toEqual([])
})

test('01 off-axis window boots and reports no face', async ({ page }) => {
  const w = watch(page)
  await page.goto('offaxis.html')

  await expect(page.locator('canvas#stage')).toBeVisible()
  await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
  await expect(page.locator('.hud-bc')).toContainText('머리를 움직여')

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

  await expect(page.locator('canvas#stage')).toBeVisible()
  await expect(page.locator('.hud-tl .wordmark')).toBeVisible()
  await expect(page.locator('.hud-bc')).toContainText('사각형을 만들어 보세요')

  await waitForRenderLoop(page)
  await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)

  expectSameOriginAssets(page, w)
  expect(w.errors).toEqual([])
})
