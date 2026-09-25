import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/server-rs/contract/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
