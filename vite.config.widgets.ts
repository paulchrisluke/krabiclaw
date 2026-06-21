import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'widgets'),
  base: '/mcp-assets/',
  build: {
    outDir: resolve(__dirname, 'public/mcp-assets'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        'photo-upload': resolve(__dirname, 'widgets/photo-upload.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-chunk.js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
