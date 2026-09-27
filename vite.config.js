import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Fixed output filenames + IIFE format so the bundle can be dropped into a
// WordPress plugin (classic <script> tag) or any other host page.
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    // The bundled fonts (src/fonts/*.woff2, ~24-60KB each) are over the 4KB
    // default, and a separate font file would break the one-<script> embed.
    // Inline them as data: URLs; everything else keeps the default rule.
    assetsInlineLimit: (file) =>
      /[\\/]src[\\/]fonts[\\/].+\.woff2$/.test(file) ? true : undefined,
    // One deliberate chunk, fonts included (~180KB of it), so the default
    // 500KB warning is expected rather than a sign of accidental bloat.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // An IIFE is always one file: Vite turns code splitting off for it, so
        // dynamic imports are inlined without any extra option.
        format: 'iife',
        name: 'SorceryPuzzleBundle',
        entryFileNames: 'sorcery-puzzle.js',
        chunkFileNames: 'sorcery-puzzle-[name].js',
        assetFileNames: 'sorcery-puzzle.[ext]',
      },
    },
  },
})
