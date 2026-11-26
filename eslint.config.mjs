import Module, { createRequire } from 'node:module';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const require = createRequire(import.meta.url);
const ts6Entry = require.resolve('@typescript/typescript6');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (
    request === 'typescript' &&
    (parent?.filename?.includes('@typescript-eslint') || parent?.filename?.includes('ts-api-utils'))
  ) {
    return ts6Entry;
  }
  return originalResolveFilename.call(this, request, parent, ...rest);
};

const { default: tsParser } = await import('@typescript-eslint/parser');

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['src/**/*.{jsx,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'jsx-a11y': jsxA11y },
    rules: jsxA11y.configs.recommended.rules,
  },
];
