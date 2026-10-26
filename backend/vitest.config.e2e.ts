import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Suites share one database. Every application instance resumes active
    // games at startup (the restart policy), so instances must not overlap.
    fileParallelism: false,
  },
});
