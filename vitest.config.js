import { defineConfig } from 'vitest/config'

// Tests cover the pure game layer (logic, store, helpers) in Node —
// no browser or WebGL needed. See test/setup.js for the localStorage stub.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
  },
})
