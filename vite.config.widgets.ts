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
        'welcome-list': resolve(__dirname, 'widgets/welcome-list.html'),
        'vertical-picker': resolve(__dirname, 'widgets/vertical-picker.html'),
        'photo-album': resolve(__dirname, 'widgets/photo-album.html'),
        'image-carousel': resolve(__dirname, 'widgets/image-carousel.html'),
        'site-preview': resolve(__dirname, 'widgets/site-preview.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-chunk.js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
