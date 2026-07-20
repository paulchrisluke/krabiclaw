import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'public/mcp-assets'),
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: resolve(__dirname, 'widgets/video-upload.ts'),
      formats: ['iife'],
      name: 'KrabiClawVideoUploadWidget',
      fileName: () => 'video-upload-widget.v1.js',
    },
  },
})
