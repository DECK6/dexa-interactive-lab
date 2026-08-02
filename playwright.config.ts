import { defineConfig } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    // vite base is '/interactive/' (DESIGN §1)
    baseURL: `http://localhost:${PORT}/interactive/`,
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  webServer: {
    command: `bunx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/interactive/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
