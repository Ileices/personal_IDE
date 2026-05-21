import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],  // Include all test files
    exclude: ['**/node_modules/**', '**/.git/**'],
    globals: true,
    environment: 'node',
    silent: true,
  },
});