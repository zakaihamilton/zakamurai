import { stripComments } from './ChangeValidatorSyntax';

/**
 * Reject CSS values that are syntactically balanced but cannot resolve at runtime.
 * This also bounds runaway local-model output such as deeply nested var() fallbacks.
 */
export function validateCssContentSafety(path: string, content: string): string | null {
  if (!/\.css$/i.test(path) || typeof content !== 'string') return null;

  const customProperty = /(?:^|[;{])\s*(--[\w-]+)\s*:\s*([^;{}]*)/gm;
  for (const match of content.matchAll(customProperty)) {
    const [, name, value] = match;
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\bvar\\(\\s*${escapedName}(?:\\s*[,)]|$)`).test(value)) {
      return `CSS custom property ${name} cannot reference itself in ${path}.`;
    }
  }

  let depth = 0;
  let maxDepth = 0;
  for (const char of stripComments(content)) {
    if (char === '(') maxDepth = Math.max(maxDepth, ++depth);
    else if (char === ')') depth--;
  }
  if (maxDepth > 16) {
    return `CSS function nesting exceeds 16 levels in ${path}. Simplify the declaration.`;
  }

  return null;
}

/**
 * Enforces the generated-project styling contract before a JSX write is staged.
 * CSS custom properties are still expressed in CSS Modules; generated components
 * must not embed CSS in JSX where it cannot be reviewed alongside its stylesheet.
 */
export function validateComponentStyling(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  if (/\bstyle\s*=\s*\{/.test(content) || /<style\b/i.test(content)) {
    return `Inline CSS is not allowed in ${path}. Move styles to a co-located *.module.css file and import it into the component.`;
  }
  return null;
}

/** Rejects CSS Module rules that collapse referenced interactive controls. */
export function validateInteractiveStyles(
  path: string,
  source: string,
  stylesheetPath: string,
  stylesheet: string,
): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof source !== 'string') return null;
  if (!/\.module\.css$/i.test(stylesheetPath) || typeof stylesheet !== 'string') return null;

  const classNames = new Set(
    [
      ...source.matchAll(/\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g),
    ].map((match) => match[1] || match[2]),
  );
  for (const className of classNames) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`, 'i').exec(stylesheet);
    if (!rule) continue;
    if (
      /\b(?:height|min-height|max-height)\s*:\s*(?:0|[0-2]px)\b|\bdisplay\s*:\s*none\b|\bvisibility\s*:\s*hidden\b/i.test(
        rule[1],
      )
    ) {
      return `CSS Module rule .${className} in ${stylesheetPath} collapses or hides a referenced control. Give interactive elements a visible size, padding, and readable state. Do not use zero/near-zero height, display:none, or visibility:hidden.`;
    }
  }
  return null;
}

/** Ensures generated components use the scoped names exported by CSS Modules. */
export function validateCssModuleUsage(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const cssModuleImport = /\bimport\s+(?:(\w+)\s+from\s+)?["'][^"']+\.module\.css["']/g;
  const matches = [...content.matchAll(cssModuleImport)];
  if (matches.length === 0) return null;
  if (matches.some((match) => !match[1])) {
    return `CSS Modules in ${path} must be default-imported as a class map (for example, use a styles binding from the co-located module) instead of side-effect imported.`;
  }
  if (
    matches.some((match) => match[1] === 'styles') &&
    /\b(?:const|let|var|function|class)\s+styles\b/.test(content)
  ) {
    return `The CSS Module binding styles is declared more than once in ${path}. Keep the imported styles class map and remove or rename the duplicate declaration.`;
  }
  if (/\bclassName\s*=\s*["'][^"']+["']/.test(content)) {
    return `Use the imported CSS Module class map in ${path} (for example, className={styles.container}) instead of literal className strings.`;
  }
  const classNameExpressions = [...content.matchAll(/\bclassName\s*=\s*\{([^{}]*)\}/g)].map(
    (match) => match[1],
  );
  const templateClassNameExpressions = [
    ...content.matchAll(/\bclassName\s*=\s*\{`([\s\S]*?)`\}/g),
  ].map((match) => match[1]);
  if (
    classNameExpressions.some(
      (expression) =>
        !/\bstyles(?:\.|\[)/.test(expression) &&
        (/[`"'][^`"']+[`"']/.test(expression) || /\?[^:]+:[^:]+/.test(expression)),
    ) ||
    templateClassNameExpressions.some((expression) =>
      /[A-Za-z_-][\w-]*/.test(expression.replace(/\$\{[\s\S]*?\}/g, '')),
    )
  ) {
    return `Use the imported CSS Module class map in ${path} (for example, className={styles.container}) instead of global or template class names.`;
  }
  return null;
}

const resolveModulePath = (fromPath: string, specifier: string): string => {
  const parts = fromPath.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
};

/** Validates CSS Module imports and selector references against a complete workspace snapshot. */
export function validateCssModuleRelationships(
  files: Record<string, string>,
  options: { requireCoLocatedFor?: string[] } = {},
): string[] {
  const errors: string[] = [];
  const requireCoLocatedFor = new Set(options.requireCoLocatedFor || []);
  for (const [path, content] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!/\.(?:jsx|tsx)$/i.test(path)) continue;
    const usageError = validateCssModuleUsage(path, content);
    if (usageError) errors.push(usageError);
    const imports = [
      ...content.matchAll(/\bimport\s+(\w+)\s+from\s+["'](\.{1,2}\/[^"']+\.module\.css)["']/g),
    ];
    if (requireCoLocatedFor.has(path)) {
      const expectedPath = path.replace(/\.(?:jsx|tsx)$/i, '.module.css');
      const importsExpectedModule = imports.some(
        (match) => resolveModulePath(path, match[2]) === expectedPath,
      );
      if (!importsExpectedModule) {
        errors.push(
          `Generated component ${path} is missing its co-located ${expectedPath} import.`,
        );
      }
    }
    for (const match of imports) {
      const [, binding, specifier] = match;
      const stylesheetPath = resolveModulePath(path, specifier);
      const stylesheet = files[stylesheetPath];
      if (typeof stylesheet !== 'string') {
        errors.push(`CSS Module import in ${path} does not resolve: ${stylesheetPath}.`);
        continue;
      }
      const referenced = new Set(
        [
          ...content.matchAll(
            new RegExp(
              `\\b${binding}(?:\\.([A-Za-z_-][\\w-]*)|\\[\\s*["']([A-Za-z_-][\\w-]*)["']\\s*\\])`,
              'g',
            ),
          ),
        ].map((reference) => reference[1] || reference[2]),
      );
      const defined = new Set(
        [...stylesheet.matchAll(/\.([A-Za-z_-][\w-]*)\s*(?=[:.{,\s])/g)].map(
          (selector) => selector[1],
        ),
      );
      const missing = [...referenced].filter((className) => !defined.has(className)).sort();
      if (missing.length) {
        errors.push(
          `CSS Module ${stylesheetPath} is missing selectors referenced by ${path}: ${missing.join(', ')}.`,
        );
      }
    }
  }
  return [...new Set(errors)];
}

/** Reject a stylesheet that was accidentally assigned a JSX or TSX path. */
export function validateFileContentType(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  const source = stripComments(content).trim();
  const containsEmbeddedCss =
    /(?:[.#][A-Za-z_-][\w-]*|:root|@(?:media|supports|keyframes|layer))\s*\{/i.test(source) ||
    /--[\w-]+\s*:/m.test(source) ||
    /(?:^|\n)\s*(?!import\b|export\b|const\b|let\b|var\b|function\b|return\b|if\b|for\b|while\b|switch\b|class\b)[a-z][\w-]*\s*\{\s*[-\w]+\s*:/im.test(
      source,
    );
  if (containsEmbeddedCss) {
    return `CSS content cannot be written to ${path}. Write it to a *.css or *.module.css file instead.`;
  }
  if (
    /^(?:async\s+)?(?:class|const|enum|export|function|import|interface|let|type|var)\b/.test(
      source,
    )
  ) {
    return null;
  }
  const startsWithCssRule =
    /^(?:@(?:container|font-face|import|keyframes|layer|media|supports)\b|:root\b|[.#*\[]|(?:[a-z][\w-]*)(?:\s*\{|\s*[>+~]\s*|\s+|\s*,\s*[.#:]?)[^{]*\{)/i.test(
      source,
    );

  if (startsWithCssRule) {
    return `CSS content cannot be written to ${path}. Write it to a *.css or *.module.css file instead.`;
  }
  return null;
}
