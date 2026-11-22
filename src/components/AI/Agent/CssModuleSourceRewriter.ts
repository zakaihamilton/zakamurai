import { cssModuleRecovery, resolveRelativePath } from './ActionLoopCssRecovery';
import {
  normalizeExternalStateCallbacks,
  normalizeMappedInteractiveElements,
} from './InteractiveSourceNormalizer';
import { extractBalancedBraces } from './JsxSourceScanner';
import { type ProjectStyleProfile, generateProjectCssModule } from './ProjectStyleProfile';

const UNITLESS_STYLE_NUMBERS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageSlice',
  'columnCount',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
]);

const staticTemplateClassNames = (template: string): string[] => {
  const body = template.slice(1, -1);
  let staticText = '';
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '$' && body[index + 1] === '{') {
      const expression = extractBalancedBraces(body, index + 1);
      if (expression) {
        staticText += ' ';
        index += expression.length;
        continue;
      }
    }
    staticText += body[index];
  }
  return staticText.match(/[A-Za-z_-][\w-]*/g) || [];
};

const normalizeClassNameExpressions = (content: string): string => {
  let normalized = normalizeExternalStateCallbacks(
    normalizeMappedInteractiveElements(content),
  ).replace(/className\s*=\s*(["'])([^"']+)\1/g, (_match, _quote: string, classValue: string) => {
    const classes = classValue.trim().split(/\s+/).filter(Boolean);
    if (!classes.length) return 'className={undefined}';
    const references = classes.map((className) =>
      /^[A-Za-z_$][\w$]*$/.test(className)
        ? `styles.${className}`
        : `styles[${JSON.stringify(className)}]`,
    );
    if (references.length === 1) return `className={${references[0]}}`;
    return `className={${references.join(" + ' ' + ")}}`;
  });
  const templateMatches = [...normalized.matchAll(/className\s*=\s*\{/g)];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const match of templateMatches) {
    const openIndex = (match.index || 0) + match[0].length - 1;
    const expression = extractBalancedBraces(normalized, openIndex);
    if (!expression) continue;
    const value = expression.slice(1, -1).trim();
    if (!value.startsWith('`') || !value.endsWith('`')) continue;
    const classes = staticTemplateClassNames(value);
    const references = classes.map((className) =>
      /^[A-Za-z_$][\w$]*$/.test(className)
        ? `styles.${className}`
        : `styles[${JSON.stringify(className)}]`,
    );
    replacements.push({
      start: match.index || 0,
      end: openIndex + expression.length,
      value: references.length
        ? references.length === 1
          ? `className={${references[0]}}`
          : `className={[${references.join(', ')}].filter(Boolean).join(' ')}`
        : 'className={undefined}',
    });
  }
  for (const replacement of replacements.reverse()) {
    normalized = `${normalized.slice(0, replacement.start)}${replacement.value}${normalized.slice(replacement.end)}`;
  }
  return normalized;
};

export const normalizeSideEffectCssSource = (
  path: string,
  content: string,
): { content: string; stylesheets: string[] } | null => {
  const imports = [...content.matchAll(/\bimport\s+(["'])(\.{1,2}\/[^"']+\.css)\1\s*;?/g)];
  const stylesImportCount = [
    ...content.matchAll(/\bimport\s+styles\s+from\s+(["'])(\.{1,2}\/[^"']+\.module\.css)\1\s*;?/g),
  ].length;
  if (!imports.length && stylesImportCount < 2) return null;

  const stylesheets = new Set<string>();
  const existingModuleImports = new Set(
    [
      ...content.matchAll(
        /\bimport\s+styles\s+from\s+(?:["'])(\.{1,2}\/[^"']+\.module\.css)(?:["'])/g,
      ),
    ].map((match) => match[1]),
  );
  let normalized = content.replace(
    /\bimport\s+(["'])(\.{1,2}\/[^"']+\.css)\1\s*;?/g,
    (_match, quote: string, specifier: string) => {
      const moduleSpecifier = specifier.endsWith('.module.css')
        ? specifier
        : specifier.replace(/\.css$/i, '.module.css');
      stylesheets.add(resolveRelativePath(path, moduleSpecifier));
      if (existingModuleImports.has(moduleSpecifier)) return '';
      existingModuleImports.add(moduleSpecifier);
      return `import styles from ${quote}${moduleSpecifier}${quote};`;
    },
  );

  const seenStylesImports = new Set<string>();
  let keptStylesBinding = false;
  normalized = normalized.replace(
    /\bimport\s+styles\s+from\s+(["'])(\.{1,2}\/[^"']+\.module\.css)\1\s*;?/g,
    (match, _quote: string, specifier: string) => {
      if (seenStylesImports.has(specifier) || keptStylesBinding) return '';
      seenStylesImports.add(specifier);
      keptStylesBinding = true;
      return match;
    },
  );

  normalized = normalizeClassNameExpressions(normalized);

  return { content: normalized, stylesheets: [...stylesheets] };
};

const camelToKebab = (name: string): string =>
  name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const jsLiteralToCssValue = (prop: string, raw: string): string | null => {
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const value = Number(trimmed);
    if (UNITLESS_STYLE_NUMBERS.has(prop)) return String(value);
    return `${value}px`;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return null;
};

const parseSimpleStyleObject = (objectBody: string): Record<string, string> | null => {
  const rules: Record<string, string> = {};
  let index = 0;
  const length = objectBody.length;
  const skipWs = () => {
    while (index < length && /\s/.test(objectBody[index])) index += 1;
  };

  while (index < length) {
    skipWs();
    if (index >= length) break;
    if (objectBody[index] === ',') {
      index += 1;
      continue;
    }
    const propMatch = /^([A-Za-z_$][\w$]*)\s*:/.exec(objectBody.slice(index));
    if (!propMatch) return null;
    const prop = propMatch[1];
    index += propMatch[0].length;
    skipWs();
    if (index >= length) return null;

    let rawValue = '';
    const start = objectBody[index];
    if (start === '"' || start === "'") {
      let cursor = index + 1;
      let escaped = false;
      while (cursor < length) {
        const char = objectBody[cursor];
        if (escaped) {
          escaped = false;
          cursor += 1;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          cursor += 1;
          continue;
        }
        if (char === start) break;
        cursor += 1;
      }
      if (cursor >= length) return null;
      rawValue = objectBody.slice(index, cursor + 1);
      index = cursor + 1;
    } else {
      const valueMatch = /^-?\d+(\.\d+)?/.exec(objectBody.slice(index));
      if (!valueMatch) return null;
      rawValue = valueMatch[0];
      index += valueMatch[0].length;
    }

    const cssValue = jsLiteralToCssValue(prop, rawValue);
    if (!cssValue) return null;
    rules[camelToKebab(prop)] = cssValue;
    skipWs();
    if (index < length && objectBody[index] === ',') index += 1;
  }

  if (!Object.keys(rules).length) return null;
  return rules;
};

/**
 * Convert React inline `style={{...}}` / `<style>` payloads into a co-located CSS Module
 * so small local models can still stage valid UI source.
 */
export const rewriteInlineStylesToCssModule = (
  path: string,
  content: string,
): { content: string; stylesheetPath: string; stylesheet: string } | null => {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  if (!/\bstyle\s*=\s*\{/.test(content) && !/<style\b/i.test(content)) return null;

  const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
  const importSpecifier = `./${stylesheetPath.split('/').pop()}`;
  const classRules: string[] = [];
  const globalBlocks: string[] = [];
  let rewritten = content;
  let classIndex = 0;

  rewritten = rewritten.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
    const css = block
      .replace(/^<style\b[^>]*>/i, '')
      .replace(/<\/style>$/i, '')
      .trim();
    if (css) globalBlocks.push(css);
    return '';
  });

  const styleAttr = /\bstyle\s*=\s*\{/g;
  const replacements: Array<{ start: number; end: number; className: string }> = [];
  let match = styleAttr.exec(rewritten);
  while (match !== null) {
    const openIndex = match.index + match[0].length - 1;
    const expression = extractBalancedBraces(rewritten, openIndex);
    if (!expression) return null;
    let objectText = expression.trim();
    if (objectText.startsWith('{') && objectText.endsWith('}')) {
      objectText = objectText.slice(1, -1).trim();
    }
    if (!(objectText.startsWith('{') && objectText.endsWith('}'))) return null;
    objectText = objectText.slice(1, -1).trim();
    const rules = parseSimpleStyleObject(objectText);
    const className = `inline${classIndex++}`;
    classRules.push(
      rules
        ? `.${className} {\n${Object.entries(rules)
            .map(([prop, value]) => `  ${prop}: ${value};`)
            .join('\n')}\n}`
        : `.${className} {\n  display: block;\n  box-sizing: border-box;\n}`,
    );
    replacements.push({
      start: match.index,
      end: openIndex + expression.length,
      className,
    });
    match = styleAttr.exec(rewritten);
  }

  for (const replacement of [...replacements].reverse()) {
    rewritten = `${rewritten.slice(0, replacement.start)}className={styles.${replacement.className}}${rewritten.slice(replacement.end)}`;
  }

  if (/\bstyle\s*=\s*\{/.test(rewritten) || /<style\b/i.test(rewritten)) return null;

  if (!/\bimport\s+\w+\s+from\s+['"][^'"]+\.module\.css['"]/.test(rewritten)) {
    const importLine = `import styles from ${JSON.stringify(importSpecifier)};\n`;
    if (/^(\s*import\b[\s\S]*?;\s*\n)+/.test(rewritten)) {
      rewritten = rewritten.replace(/^((?:\s*import\b[\s\S]*?;\s*\n)+)/, `$1${importLine}`);
    } else {
      rewritten = `${importLine}${rewritten}`;
    }
  }

  const stylesheet = [...classRules, ...globalBlocks].join('\n\n').trim();
  if (!stylesheet && !classRules.length) return null;
  return {
    content: rewritten,
    stylesheetPath,
    stylesheet: stylesheet ? `${stylesheet}\n` : '.component {\n  display: block;\n}\n',
  };
};

const insertCssModuleImport = (content: string, importSpecifier: string): string => {
  const importLine = `import styles from ${JSON.stringify(importSpecifier)};\n`;
  if (/\bimport\s+\w+\s+from\s+['"][^'"]+\.module\.css['"]/.test(content)) return content;
  if (/^(\s*import\b[\s\S]*?;\s*\n)+/.test(content)) {
    return content.replace(/^((?:\s*import\b[\s\S]*?;\s*\n)+)/, `$1${importLine}`);
  }
  return `${importLine}${content}`;
};

const annotateInteractiveClassNames = (content: string): string => {
  let rewritten = content;
  rewritten = rewritten.replace(
    /(return\s*(?:\(\s*)?)<(main|div|section|article|form)(?![^>]*\bclassName\s*=)/,
    '$1<$2 className={styles.app}',
  );
  rewritten = rewritten.replace(
    /<h1(?![^>]*\bclassName\s*=)(\s|>)/g,
    '<h1 className={styles.title}$1',
  );
  rewritten = rewritten.replace(
    /<button(?![^>]*\bclassName\s*=)(\s|>)/gi,
    '<button className={styles.button}$1',
  );
  rewritten = rewritten.replace(
    /<(input|select|textarea)(?![^>]*\bclassName\s*=)(\s|>)/gi,
    '<$1 className={styles.control}$2',
  );
  if (
    (/styles\.button/.test(rewritten) || /styles\.control/.test(rewritten)) &&
    /\.map\s*\(/.test(rewritten)
  ) {
    rewritten = rewritten.replace(
      /<(div|ul|ol)(?![^>]*\bclassName\s*=)((?:[^>=]|=\{[^}]*\}|=[^>\s]+|\s)*)>(\s*\{[\s\S]{0,240}?\.map\s*\()/m,
      '<$1 className={styles.list}$2>$3',
    );
  }
  return rewritten;
};

/**
 * Generated interactive JSX can arrive without a stylesheet or with literal class names.
 * Attach a co-located CSS Module and generic layout class names so the preview is usable
 * without requiring another model turn. Static layouts that already bind `styles.*` only
 * need the missing stylesheet — do not rewrite their className expressions.
 */
export const ensureCoLocatedCssModule = (
  path: string,
  content: string,
  profile?: ProjectStyleProfile,
): { content: string; stylesheetPath: string; stylesheet: string } | null => {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  const isInteractive = /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  const usesCssModule =
    /\bstyles(?:\.[A-Za-z_]|\[)/.test(content) ||
    /\bimport\s+\w+\s+from\s+['"][^"']+\.module\.css['"]/.test(content);
  if (!isInteractive && !usesCssModule) return null;

  const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
  const importSpecifier = `./${stylesheetPath.split('/').pop()}`;
  const rewritten = isInteractive
    ? normalizeClassNameExpressions(
        annotateInteractiveClassNames(insertCssModuleImport(content, importSpecifier)),
      )
    : insertCssModuleImport(content, importSpecifier);
  return {
    content: rewritten,
    stylesheetPath,
    stylesheet: profile
      ? generateProjectCssModule({ source: rewritten, stylesheetPath, profile })
      : cssModuleRecovery(rewritten, undefined, stylesheetPath),
  };
};
