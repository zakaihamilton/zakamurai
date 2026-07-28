import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const isCoverageRun = process.argv.includes('--coverage');

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    // Playwright owns browser suites. Keeping both paths here prevents Vitest
    // from collecting Playwright's `test()` calls during unit/coverage runs.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/visual/**',
      '**/tests/isolated-preview/**',
      // The benchmark has its own deterministic gate (`npm run test:performance`).
      // Coverage instrumentation measures different work and can make it exceed
      // the normal unit-test timeout on slower CI runners.
      ...(isCoverageRun ? ['**/EditorPerformance.test.js'] : []),
    ],
    include: ['src/**/*.{test,spec}.{js,jsx}', 'tests/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: ['src/setupTests.js', 'src/**/*.test.{js,jsx}', 'src/**/*.spec.{js,jsx}'],
      thresholds: {
        statements: 80,
        branches: 85,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      src: path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    loader: 'tsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});
