import { defineConfig } from 'vitest/config';

// Tests are pure functions plus local in-memory SQLite migration tests. They run
// without the React and Cloudflare Vite plugins from vite.config.ts.
export default defineConfig({
  test: { environment: 'node', include: ['worker/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
});
