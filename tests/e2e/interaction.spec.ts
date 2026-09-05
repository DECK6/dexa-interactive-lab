import { expect, test } from '@playwright/test'

const newPages = ['optics', 'swarm', 'growth', 'cloth', 'harp']
for (const slug of newPages) {
  test(`${slug}: preview, pointer interaction and local camera`, async ({ page }) => {
    const errors: string[] = [], requests: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('request', r => requests.push(r.url()))
    await page.goto(`${slug}.html`)
    await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/, { timeout: 20_000 })
    await expect(page.locator('#stage')).toHaveAttribute('data-input', 'pointer')
    expect(requests.filter(u => /\/models\//.test(u))).toEqual([])
    if (slug === 'optics') await page.screenshot({ path: '.planning/M3/P1/qa/optics-default.png' })
    await page.mouse.move(480, 350)
    await page.mouse.down()
    await page.mouse.move(600, 420, { steps: 20 })
    await expect(page.locator('#stage')).toHaveAttribute('data-hands', '1')
    if (slug === 'cloth') await expect(page.locator('#stage')).toHaveAttribute('data-grabs', '1')
    await page.mouse.up()
    if (slug === 'harp') {
      await expect(page.locator('#stage')).not.toHaveAttribute('data-plucks', '0')
      await page.locator('[data-action="audio"]').click()
      await expect(page.locator('#stage')).toHaveAttribute('data-audio', 'true')
    }
    await page.screenshot({ path: `.planning/M3/P1/qa/${slug}.png` })
    await page.locator('[data-action="reset"]').click()
    if (slug === 'cloth') {
      await page.mouse.move(600, 400)
      await page.keyboard.down('Shift'); await page.mouse.down()
      await expect(page.locator('#stage')).toHaveAttribute('data-grabs', '2')
      await page.mouse.move(710, 320, { steps: 20 })
      await page.screenshot({ path: '.planning/M3/P1/qa/cloth-two-hands.png' })
      await page.mouse.up(); await page.keyboard.up('Shift')
    }
    await page.locator('[data-action="camera"]').click()
    await expect(page.locator('#stage')).toHaveAttribute('data-input', 'camera', { timeout: 30_000 })
    await expect(page.locator('.hud-tr .dot')).toHaveClass(/\boff\b/)
    const assets = requests.filter(u => /\/(models|wasm)\//.test(u))
    expect(assets.length).toBeGreaterThan(0)
    expect(assets.every(u => u.startsWith(new URL(page.url()).origin))).toBe(true)
    await page.locator('[data-action="camera"]').click()
    await expect(page.locator('#stage')).toHaveAttribute('data-input', 'pointer')
    expect(errors).toEqual([])
  })
}

test('camera denial keeps the preview usable', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') } })
  await page.goto('cloth.html')
  await page.locator('[data-action="camera"]').click()
  await expect(page.getByRole('status')).toContainText('마우스로 계속')
  await page.mouse.move(580, 380); await page.mouse.down(); await page.mouse.move(650, 320, { steps: 10 })
  await expect(page.locator('#stage')).toHaveAttribute('data-grabs', '1')
  await page.mouse.up()
})

test('fingerframe capture, placement, bounded cards and filters', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('fingerframe.html')
  await page.locator('[data-action="capture"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'holding')
  await page.screenshot({ path: '.planning/M3/P1/qa/fingerframe.png' })
  await page.locator('[data-action="place"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-pieces', '1')
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-action="capture"]').click()
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'holding')
    await page.locator('[data-action="place"]').click()
  }
  await expect(page.locator('body')).toHaveAttribute('data-pieces', '5')
  await page.locator('[data-mode="filters"]').click()
  await page.screenshot({ path: '.planning/M3/P1/qa/fingerframe-filters.png' })
  await page.locator('[data-mode="relief"]').click()
  await page.locator('[data-action="reset"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-pieces', '0')
  expect(errors).toEqual([])
})

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`mobile ${viewport.width}: seven updated pages keep controls in view`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const slug of ['offaxis', 'fingerframe', ...newPages]) {
      await page.goto(`${slug}.html`)
      await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/, { timeout: 20_000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `.planning/M3/P1/qa/${slug}-mobile-${viewport.width}.png` })
      if (slug === 'fingerframe') {
        await page.locator('[data-action="capture"]').click()
        await expect(page.locator('body')).toHaveAttribute('data-phase', 'holding')
        await page.locator('[data-action="place"]').click()
        await page.locator('.ff-mobile-toggle').click()
        await expect(page.locator('.ff-mobile-toggle')).toHaveAttribute('aria-expanded', 'true')
        await page.screenshot({ path: `.planning/M3/P1/qa/fingerframe-settings-${viewport.width}.png` })
        await page.locator('.ff-mobile-toggle').click()
        await page.locator('[data-action="reset"]').click()
        await expect(page.locator('body')).toHaveAttribute('data-pieces', '0')
      }
      if (slug !== 'fingerframe') {
        const snap = await page.locator('.hud-br').boundingBox(), hint = await page.locator('.hud-bc').boundingBox()
        expect(snap!.y + snap!.height).toBeLessThan(hint!.y)
      }
    }
    expect(errors).toEqual([])
  })
}

test('restored cached pages reinitialize their disposed renderers', async ({ page }) => {
  for (const slug of ['cloth', 'offaxis', 'fingerframe']) {
    await page.goto(`${slug}.html`)
    await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/)
    // Deterministic reproduction of a back/forward-cache page transition.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    const reloaded = page.waitForEvent('load', { timeout: 5000 })
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await reloaded
    await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/)
  }
})

test('offaxis renders perspective preview and mobile controls fit', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('offaxis.html')
  await expect(page.locator('#stage')).toHaveAttribute('data-input', 'pointer')
  await page.mouse.move(350, 350, { steps: 10 })
  await page.screenshot({ path: '.planning/M3/P1/qa/offaxis.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('harp.html')
  await expect(page.locator('.hud-fps')).toHaveText(/^\d+ FPS$/)
  await page.screenshot({ path: '.planning/M3/P1/qa/harp-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 500, height: 400 })
  await page.screenshot({ path: '.planning/M3/P1/qa/harp-landscape.png' })
  expect(errors).toEqual([])
})
