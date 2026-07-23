import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Fixed output filenames + IIFE format so the bundle can be dropped into a
// WordPress plugin (classic <script> tag) or any other host page.
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'SorceryPuzzleBundle',
        inlineDynamicImports: true,
        entryFileNames: 'sorcery-puzzle.js',
        chunkFileNames: 'sorcery-puzzle-[name].js',
        assetFileNames: 'sorcery-puzzle.[ext]',
      },
    },
  },
})
