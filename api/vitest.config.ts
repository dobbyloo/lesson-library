import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Builds the migrated template database once, before any test file runs.
    globalSetup: ['test/helpers/global-setup.ts'],
  },
});
