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
      },
    },
  },
})
