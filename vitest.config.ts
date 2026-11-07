import { defineConfig } from 'vitest/config';

// Tests are pure functions, so they run without the React and Cloudflare Vite plugins from vite.config.ts.
export default defineConfig({
  test: { environment: 'node', include: ['worker/**/*.test.ts', 'src/**/*.test.ts'] },
});
