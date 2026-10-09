import tsParser from '@typescript-eslint/parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
        onUnsupportedTypeScriptVersion: 'ignore',
      },
    },
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.test.{ts,tsx}',
    ],
  },
];
