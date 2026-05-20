const escapedClassName = 'title';
const stringLiteralRegex = new RegExp(
  `['"\\\`][^'"\\\`]*?(?<![a-zA-Z0-9_\\\\-])${escapedClassName}(?![a-zA-Z0-9_\\\\-])`,
  'g',
);
const code = "const a = 'container title';";
console.log('Match:', stringLiteralRegex.exec(code));
