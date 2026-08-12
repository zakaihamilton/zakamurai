module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Prevent dependency cycles.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-source-to-test',
      comment: 'Production source must not depend on tests.',
      severity: 'error',
      from: {
        path: '^(src|app|pages)(/|$)',
        pathNot: '(^|/)(test|tests|__tests__)(/|$)|\\.(spec|test)\\.[cm]?[jt]sx?$',
      },
      to: { path: '(^|/)(test|tests|__tests__)(/|$)|\\.(spec|test)\\.[cm]?[jt]sx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage|\\.next|generated)(/|$)' },
  },
};
