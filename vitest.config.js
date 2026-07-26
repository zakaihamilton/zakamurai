import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: ['src/setupTests.js', 'src/**/*.test.{js,jsx}', 'src/**/*.spec.{js,jsx}'],
      thresholds: {
        statements: 80,
        branches: 80,
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
