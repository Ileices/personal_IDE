import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
