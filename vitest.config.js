import { defineConfig } from 'vitest/config'

// Unit tests for the store's rules and the puzzle file format. Kept separate
// from vite.config.js so the production build config stays untouched.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
