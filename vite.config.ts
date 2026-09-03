import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: '/interactive/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        offaxis: resolve(__dirname, 'offaxis.html'),
        fingerframe: resolve(__dirname, 'fingerframe.html'),
        puppet: resolve(__dirname, 'puppet.html'),
        echo: resolve(__dirname, 'echo.html'),
        dust: resolve(__dirname, 'dust.html'),
        fluid: resolve(__dirname, 'fluid.html'),
        graffiti: resolve(__dirname, 'graffiti.html'),
        snow: resolve(__dirname, 'snow.html'),
      },
    },
  },
})
