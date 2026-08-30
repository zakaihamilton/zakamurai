import type { AgentChange, EsbuildTransform, ValidatedAIChanges } from '@/components/AI/types';
import { hasValidAiChangeContent, isProjectRelativePath } from '@/contracts/ai';
import { stripComments, validateContentSyntax } from './ChangeValidatorSyntax';

export { validateContentSyntax } from './ChangeValidatorSyntax';

/** Shared safety checks for AI-proposed workspace changes. */
export function validateProjectPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return 'A file path is required.';
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return `Path must be project-relative: ${path}`;
  }
  if (!isProjectRelativePath(path)) {
    return `Unsafe project path: ${path}`;
  }
  return null;
}

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

const isAppEntryPath = (path: string): boolean =>
  /(?:^|\/)(?:App|main|index)\.(?:jsx|tsx)$/i.test(path);

/** Rejects comment-only scaffolding and non-code prose that claims to be an implementation. */
export function validateGeneratedPlaceholder(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const sourceShapeError = validateGeneratedSourceShape(path, content);
  if (sourceShapeError) return sourceShapeError;
  if (
    isAppEntryPath(path) &&
    (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content))
  ) {
    return `Generated content for ${path} still looks like the starter template. Replace the starter screen with the requested implementation.`;
  }
  const stripped = stripComments(content).trim();
  if (!stripped) {
    if (
      !/(?:your\s+)?implementation\b|goes\s+here|insert\s+(?:code|implementation)|\bTODO\b/i.test(
        content,
      )
    ) {
      return null;
    }
    return `Generated content for ${path} is only a placeholder. Return a complete working implementation instead.`;
  }

  if (!/\.(?:jsx|tsx)$/i.test(path)) return null;

  // Stylesheet-shaped payloads are handled by validateFileContentType.
  if (
    /^(?:@(?:container|font-face|import|keyframes|layer|media|supports)\b|:root\b|[.#*\[]|(?:[a-z][\w-]*)(?:\s*\{|\s*[>+~]\s*|\s+|\s*,\s*[.#:]?)[^{]*\{)/i.test(
      stripped,
    )
  ) {
    return null;
  }

  const looksLikeSource =
    /^(?:async\s+)?(?:class|const|enum|export|function|import|interface|let|type|var)\b/m.test(
      stripped,
    ) ||
    /\b(?:export\s+default|function\s+[A-Za-z_$]|=>\s*[{(]|return\s*[(<]|use(?:State|Effect|Memo|Callback|Ref)\s*\(|<[A-Za-z][\w.]*)/.test(
      stripped,
    );
  if (!looksLikeSource) {
    return `Generated content for ${path} is not valid source code. Return a complete working implementation instead of prose or a request paraphrase.`;
  }
  return null;
}

/** Reject common small-model payloads that are balanced but target the wrong source boundary. */
export function validateGeneratedSourceShape(path: string, content: string): string | null {
  if (!/\.(?:jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  if (isAppEntryPath(path) && /\bReactDOM\.(?:createRoot|render)\s*\(/.test(content)) {
    return `Generated component ${path} contains ReactDOM bootstrap code. Return only the component source; keep createRoot/render in the existing entry file.`;
  }

  if (/(?:<!DOCTYPE\s+html\b|<html[\s>])/i.test(content)) {
    return `Generated component ${path} contains an HTML document. Return only the React component module source.`;
  }

  if (/<style\b/i.test(content)) {
    return `Generated component ${path} contains a <style> tag. Move visual rules to the co-located CSS Module instead.`;
  }

  if (
    /\b(?:const|let|var)\s+styles\s*=\s*\{[\s\S]*?\b(?:display|position|background(?:-color)?|color|padding|margin|width|height|min-height|border-radius)\s*:/.test(
      content,
    )
  ) {
    return `Generated component ${path} contains a CSS-style object. Move visual rules to the co-located CSS Module and use the imported styles class map.`;
  }

  if (/```/.test(content)) {
    return `Generated component ${path} contains a nested code fence. Return the complete source without markdown fences inside the file.`;
  }

  const defaultExports = content.match(/\bexport\s+default\b/g) || [];
  if (defaultExports.length > 1) {
    return `Generated component ${path} contains multiple default exports. Return exactly one default-exported component.`;
  }

  if (
    isAppEntryPath(path) &&
    /\bdocument\.(?:getElementById|querySelector|querySelectorAll)\s*\(/.test(content)
  ) {
    return `Generated component ${path} queries the document DOM directly. Return component JSX only; keep DOM mounting in the existing entry file.`;
  }

  const trimmed = content.trimEnd();
  if (
    /(?:\.\.\.|…)\s*$/.test(trimmed) ||
    /(?:\/\/\s*(?:TODO|FIXME|implementation goes here)|\/\*\s*(?:TODO|FIXME)\b)[^\n]*$/i.test(
      trimmed,
    )
  ) {
    return `Generated content for ${path} looks truncated or unfinished. Return the complete working source file.`;
  }

  return null;
}

const clipRequest = (request: string): string => request.trim().replace(/\s+/g, ' ').slice(0, 80);

const hasCollectionTextEntry = (content: string): boolean =>
  /<(?:input|textarea)\b(?=[^>]*\bon(?:Change|Input)\s*=)(?![^>]*\btype\s*=\s*["'](?:checkbox|radio|hidden)["'])[^>]*>/i.test(
    content,
  );

const hasCollectionAddControl = (content: string): boolean =>
  /<button\b[^>]*\bonClick\s*=\s*\{[^}]*\b[A-Za-z_$]*(?:add|create|save|submit|new)[A-Za-z0-9_$]*\b[^}]*\}[^>]*>[\s\S]{0,160}?\b(?:add|new|create|save|submit)\b[\s\S]{0,160}?<\/button>/i.test(
    content,
  ) ||
  /<button\b[^>]*\btype\s*=\s*["']submit["'][^>]*>[\s\S]{0,160}?\b(?:add|new|create|save|submit)\b[\s\S]{0,160}?<\/button>/i.test(
    content,
  ) ||
  /<form\b[^>]*\bonSubmit\s*=\s*\{[^}]+\}[^>]*>[\s\S]{0,600}?<button\b[^>]*>[\s\S]{0,160}?\b(?:add|new|create|save|submit)\b[\s\S]{0,160}?<\/button>[\s\S]*?<\/form>/i.test(
    content,
  );

const hasVisibleEmptyState = (content: string): boolean =>
  /<(?:p|div|span|output|section)\b[^>]*>[\s\S]{0,180}?\b(?:no\s+\w+|nothing|empty|none|start|add\s+(?:your|a|the)\s+first|get\s+started)\b[\s\S]{0,180}?<\/(?:p|div|span|output|section)>/i.test(
    content,
  );

const isThinComponentShell = (path: string, content: string): boolean =>
  isAppEntryPath(path) &&
  /import\s+[A-Za-z_$][\w$]*\s+from\s+["']\.\/(?:components\/)?[^"']+["']/.test(content) &&
  content.trim().length < 500;

const braceDepthAt = (content: string, position: number): number => {
  const source = stripComments(content.slice(0, position));
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (const char of source) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
};

const functionBody = (content: string, start: number): string => {
  const open = content.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < content.length; index++) {
    if (content[index] === '{') depth += 1;
    else if (content[index] === '}' && --depth === 0) return content.slice(open, index + 1);
  }
  return content.slice(open);
};

const validateStatefulCallbackScope = (content: string): string | null => {
  const setters = [
    ...content.matchAll(
      /\bconst\s*\[\s*[A-Za-z_$][\w$]*\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\b/g,
    ),
  ].map((match) => match[1]);
  if (!setters.length) return null;

  const isCallbackName = (name: string): boolean =>
    /^(?:handle|on[A-Z]|reset|restart|new|add|remove|delete|toggle|submit|clear|update|set|save|load|apply|cancel|close|open|select|move|next|previous)/.test(
      name,
    );
  const callbackPattern =
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;
  for (const match of content.matchAll(callbackPattern)) {
    const name = match[1] || match[2] || '';
    if (!isCallbackName(name)) continue;
    if (braceDepthAt(content, match.index ?? 0) !== 0) continue;
    const body = functionBody(content, match.index ?? 0);
    if (setters.some((setter) => new RegExp(`\\b${setter}\\s*\\(`).test(body))) {
      return `${name} accesses React state setters outside the component. Keep state-dependent callbacks inside the component so they close over valid state.`;
    }
  }

  return null;
};

/**
 * Rejects starter-template leftovers and trivial shells for create/build requests.
 * Small local models often rename the placeholder title and finish without a real app.
 */
export function validateRequestFulfillment(
  path: string,
  content: string,
  request: string,
): string | null {
  if (typeof content !== 'string' || typeof request !== 'string') return null;
  if (!/\.(?:jsx|tsx)$/i.test(path)) return null;
  if (!/\b(?:add|build|create|implement|make)\b/i.test(request)) return null;

  const clipped = clipRequest(request);
  if (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content)) {
    return `Generated content for ${path} still looks like the starter template. Implement the full request ("${clipped}") instead of leaving placeholder copy.`;
  }

  if (!isAppEntryPath(path) && !/components\//i.test(path)) return null;

  // Thin App shells that only mount a component are fine; the component must fulfill the request.
  if (isThinComponentShell(path, content)) return null;

  const hasHeading = /<h[1-6]\b/i.test(content);
  const hasMeaningfulSurface =
    /<(?:button|input|select|textarea|a|img|canvas|form|section|article|ul|ol|p|table)\b/i.test(
      content,
    );
  if (hasHeading && !hasMeaningfulSurface) {
    return `Generated content for ${path} only renders a heading. Add the requested app's visible content, controls, or primary interaction before finishing.`;
  }

  const isEmptyMappedCollection =
    /\buseState\s*\(\s*\[\s*\]\s*\)/.test(content) && /\.map\s*\(/.test(content);
  if (
    isEmptyMappedCollection &&
    !(hasCollectionTextEntry(content) && hasCollectionAddControl(content)) &&
    !hasVisibleEmptyState(content)
  ) {
    return `Generated content for ${path} renders an empty collection without an entry flow or clear empty state. Add a visible input or textarea plus a create/add/submit control, or tell the user what to do next when the collection has no items.`;
  }

  const hasIndexedInteraction =
    /\b(?:index|position|row|column)\b/.test(content) &&
    /\bon(?:Click|Change|Input|KeyDown)\b/.test(content);
  if (
    hasIndexedInteraction &&
    /\bset[A-Z][A-Za-z0-9_$]*\s*\(\s*\(\s*prev[A-Za-z_$]*\s*\)\s*=>\s*\[\s*\.\.\.\s*prev[A-Za-z_$]*\s*,/i.test(
      content,
    )
  ) {
    return `Generated content for ${path} appends an indexed interaction to a collection instead of updating the targeted item. Copy the collection, assign nextValue[index] (or the equivalent targeted position), and derive dependent status from that next value before updating state.`;
  }

  if (
    /\b(?:current|active)(?:Player|Turn)\b\s*!==?\s*["'][^"']+["']/i.test(content) &&
    /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content)
  ) {
    return `Generated content for ${path} blocks an interactive turn for every value except a hard-coded player or turn. Allow each active turn to act, or implement an explicit opponent rule without silently disabling the other values.`;
  }

  // Only the mapped root opening tag matters. Nested delete/toggle buttons inside
  // <li>/<div> are valid; a bare <div onClick> cell is not.
  const mappedClickableElement =
    /\.map\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\(\s*)?<([a-z][\w.-]*)\b([^>]*?)\bonClick\s*=/i.exec(
      content,
    );
  if (
    mappedClickableElement &&
    mappedClickableElement[1].toLowerCase() !== 'button' &&
    !/role\s*=\s*["']button["']/i.test(mappedClickableElement[2])
  ) {
    return `Generated content for ${path} uses a non-interactive element as a clickable collection item. Use a button or an element with an explicit button role, keyboard handler, focus state, and visible control styling.`;
  }

  if (
    /\b(?:check|calculate|derive|evaluate)(?:Win|Winner|Status|Result)?\s*\(\s*\)/i.test(content) &&
    /(?:function\s+(?:check|calculate|derive|evaluate)[A-Za-z_$]*\b|(?:const|let)\s+(?:check|calculate|derive|evaluate)[A-Za-z_$]*\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)[\s\S]*\b(?:board|items|value|state)\s*(?:\.|\[)/i.test(
      content,
    )
  ) {
    return `Generated content for ${path} derives status from stale state after an update. Pass the next value into the calculation, derive the result before state setters, then update state and status together.`;
  }

  if (content.trim().length < 400) {
    return `Generated content for ${path} is too short to fulfill "${clipped}". Return a complete implementation instead of a stub.`;
  }

  const looksInteractive =
    /<(?:button|input|select|textarea)\b/i.test(content) ||
    /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  if (!looksInteractive) return null;

  const hasState = /\buse(?:State|Reducer)\b/.test(content);
  const hasInteraction = /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
  if (!hasState || !hasInteraction) {
    return `Generated content for ${path} does not look like a working implementation of "${clipped}". Include React state (useState/useReducer) and event handlers so the UI is interactive.`;
  }

  return validateStatefulCallbackScope(content);
}

/** Ensures referenced React state setters have a co-located useState declaration. */
export function validateDeclaredStateVariables(path: string, content: string): string | null {
  if (!/\.(jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;
  const clean = stripComments(content);

  const declaredStateVars = new Set<string>();
  const declaredSetters = new Set<string>();

  const useStateMatches = clean.matchAll(
    /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\b/g,
  );
  for (const match of useStateMatches) {
    declaredStateVars.add(match[1]);
    declaredSetters.add(match[2]);
  }

  const setterUsages = clean.matchAll(/\b(set[A-Z][A-Za-z0-9_$]*)\s*\(/g);
  for (const match of setterUsages) {
    const setterName = match[1];
    if (!declaredSetters.has(setterName)) {
      const stateVarName = setterName.slice(3, 4).toLowerCase() + setterName.slice(4);
      if (!declaredStateVars.has(stateVarName)) {
        return `Undeclared state setter '${setterName}' in ${path}. Declare const [${stateVarName}, ${setterName}] = useState(...) inside the component.`;
      }
    }
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

/** True when staged JSX fulfills a create/build request (including required CSS Modules). */
export function workspaceFulfillsInteractiveRequest(
  files: Record<string, string>,
  request: string,
): string | null {
  if (typeof request !== 'string') return null;
  if (!/\b(?:add|build|create|implement|make)\b/i.test(request)) return null;

  const jsxFiles = Object.entries(files).filter(([path]) => /\.(?:jsx|tsx)$/i.test(path));
  for (const [path, content] of jsxFiles) {
    if (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content)) {
      return `Generated content for ${path} still looks like the starter template. Implement the full request ("${clipRequest(request)}") instead of leaving placeholder copy.`;
    }
  }

  const implementors = jsxFiles.filter(([path, content]) => !isThinComponentShell(path, content));
  if (!implementors.length) {
    return `Staged files do not fulfill "${clipRequest(request)}". Return a complete implementation before finishing.`;
  }

  for (const [path, content] of implementors) {
    if (validateRequestFulfillment(path, content, request)) continue;
    const needsStyles =
      /<(?:button|input|select|textarea)\b/i.test(content) ||
      /\bon(?:Click|Change|Submit|KeyDown)\b/.test(content);
    if (needsStyles) {
      const stylesheetPath = path.replace(/\.(jsx|tsx)$/i, '.module.css');
      if (!/\.module\.css/.test(content) || !Object.hasOwn(files, stylesheetPath)) {
        return `Generated content for ${path} is missing a co-located CSS Module (${stylesheetPath}). Import styles from that module and include layout rules for the UI.`;
      }
      const styleError = validateInteractiveStyles(
        path,
        content,
        stylesheetPath,
        files[stylesheetPath] || '',
      );
      if (styleError) {
        return styleError;
      }
    }
    return null;
  }

  return validateRequestFulfillment(implementors[0][0], implementors[0][1], request);
}

/** Keeps small generated apps on local state instead of adding unrequested state libraries. */
export function validateForbiddenStateLibraryUsage(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const forbiddenPackage = /^(?:@reduxjs\/toolkit|redux|recoil|zustand)(?:\/|$)/i;
  const isPackageManifest = /(?:^|\/)package\.json$/i.test(path);
  const usesForbiddenPackage = isPackageManifest
    ? /["'](?:@reduxjs\/toolkit|redux|recoil|zustand)["']\s*:/i.test(content)
    : /(?:from\s*|require\(\s*|import\s*\(\s*)["'][^"']+["']/i.test(content) &&
      [...content.matchAll(/(?:from\s*|require\(\s*|import\s*\(\s*)["']([^"']+)["']/gi)].some(
        (match) => forbiddenPackage.test(match[1]),
      );
  return usesForbiddenPackage
    ? `Do not introduce Redux, Zustand, Recoil, or another unrequested state library in ${path}. Use React local state or plain browser state instead.`
    : null;
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

/** Async syntax validation with esbuild transform attempt if initialized. */
export async function validateContentSyntaxAsync(
  path: string,
  content: string,
  esbuildTransform: EsbuildTransform | null = null,
): Promise<string | null> {
  const syncError = validateContentSyntax(path, content);
  if (syncError) return syncError;

  if (typeof esbuildTransform === 'function') {
    const ext = path.split('.').pop()?.toLowerCase();
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext || '')) {
      try {
        const loader = ext === 'tsx' ? 'tsx' : ext === 'ts' ? 'ts' : ext === 'jsx' ? 'jsx' : 'js';
        await esbuildTransform(content, { loader });
      } catch (err) {
        const error = err as Error;
        return `Syntax error in ${path}: ${error.message || String(err)}`;
      }
    }
  }

  return null;
}

/**
 * Async validation for structured AI changes including esbuild transform checks.
 */
export async function validateAIChangesAsync(
  changes: AgentChange[],
  esbuildTransform: EsbuildTransform | null = null,
): Promise<ValidatedAIChanges> {
  if (!Array.isArray(changes)) {
    return { accepted: [], rejected: ['Changes must be an array.'], details: [] };
  }
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  const details: NonNullable<ValidatedAIChanges['details']> = [];

  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      details.push({ path: String(path), error: pathError, type: 'path' });
      continue;
    }
    if (seen.has(path as string)) {
      const conflictErr = `Conflicting operations target ${path}.`;
      rejected.push(conflictErr);
      details.push({ path: String(path), error: conflictErr, type: 'conflict' });
      continue;
    }

    const content = change.content ?? change.after;
    if (!hasValidAiChangeContent(change)) {
      const contentErr = `Invalid change content for ${path}.`;
      rejected.push(contentErr);
      details.push({ path: String(path), error: contentErr, type: 'content' });
      continue;
    }

    if (typeof content === 'string') {
      const placeholderError = validateGeneratedPlaceholder(path as string, content);
      if (placeholderError) {
        rejected.push(placeholderError);
        details.push({
          path: String(path),
          error: placeholderError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const stateLibraryError = validateForbiddenStateLibraryUsage(path as string, content);
      if (stateLibraryError) {
        rejected.push(stateLibraryError);
        details.push({
          path: String(path),
          error: stateLibraryError,
          type: 'architecture',
          failedContent: content,
        });
        continue;
      }
      const stylingError = validateComponentStyling(path as string, content);
      if (stylingError) {
        rejected.push(stylingError);
        details.push({
          path: String(path),
          error: stylingError,
          type: 'styling',
          failedContent: content,
        });
        continue;
      }
      const cssModuleError = validateCssModuleUsage(path as string, content);
      if (cssModuleError) {
        rejected.push(cssModuleError);
        details.push({
          path: String(path),
          error: cssModuleError,
          type: 'styling',
          failedContent: content,
        });
        continue;
      }
      const contentTypeError = validateFileContentType(path as string, content);
      if (contentTypeError) {
        rejected.push(contentTypeError);
        details.push({
          path: String(path),
          error: contentTypeError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const cssSafetyError = validateCssContentSafety(path as string, content);
      if (cssSafetyError) {
        rejected.push(cssSafetyError);
        details.push({
          path: String(path),
          error: cssSafetyError,
          type: 'content',
          failedContent: content,
        });
        continue;
      }
      const stateVarError = validateDeclaredStateVariables(path as string, content);
      if (stateVarError) {
        rejected.push(stateVarError);
        details.push({
          path: String(path),
          error: stateVarError,
          type: 'syntax',
          failedContent: content,
        });
        continue;
      }
      const syntaxError = await validateContentSyntaxAsync(
        path as string,
        content,
        esbuildTransform,
      );
      if (syntaxError) {
        rejected.push(syntaxError);
        details.push({
          path: String(path),
          error: syntaxError,
          type: 'syntax',
          failedContent: content,
        });
        continue;
      }
    }

    seen.add(path as string);
    accepted.push(change);
  }

  return { accepted, rejected, details };
}

/**
 * Returns structured accepted/rejected operations so callers can preserve the
 * staged review flow while explaining why unsafe proposals were ignored.
 */
export function validateAIChanges(changes: AgentChange[]): ValidatedAIChanges {
  if (!Array.isArray(changes)) return { accepted: [], rejected: ['Changes must be an array.'] };
  const seen = new Set<string>();
  const accepted: AgentChange[] = [];
  const rejected: string[] = [];
  for (const change of changes) {
    const path = change?.path ?? change?.filePath;
    const pathError = validateProjectPath(path);
    if (pathError) {
      rejected.push(pathError);
      continue;
    }
    if (seen.has(path as string)) {
      rejected.push(`Conflicting operations target ${path}.`);
      continue;
    }

    const content = change.content ?? change.after;
    if (!hasValidAiChangeContent(change)) {
      rejected.push(`Invalid change content for ${path}.`);
      continue;
    }

    if (typeof content === 'string') {
      const placeholderError = validateGeneratedPlaceholder(path as string, content);
      if (placeholderError) {
        rejected.push(placeholderError);
        continue;
      }
      const stateLibraryError = validateForbiddenStateLibraryUsage(path as string, content);
      if (stateLibraryError) {
        rejected.push(stateLibraryError);
        continue;
      }
      const stylingError = validateComponentStyling(path as string, content);
      if (stylingError) {
        rejected.push(stylingError);
        continue;
      }
      const cssModuleError = validateCssModuleUsage(path as string, content);
      if (cssModuleError) {
        rejected.push(cssModuleError);
        continue;
      }
      const contentTypeError = validateFileContentType(path as string, content);
      if (contentTypeError) {
        rejected.push(contentTypeError);
        continue;
      }
      const cssSafetyError = validateCssContentSafety(path as string, content);
      if (cssSafetyError) {
        rejected.push(cssSafetyError);
        continue;
      }
      const stateVarError = validateDeclaredStateVariables(path as string, content);
      if (stateVarError) {
        rejected.push(stateVarError);
        continue;
      }
      const syntaxError = validateContentSyntax(path as string, content);
      if (syntaxError) {
        rejected.push(syntaxError);
        continue;
      }
    }

    seen.add(path as string);
    accepted.push(change);
  }
  return { accepted, rejected };
}

/**
 * Validates component modularity and CSS module co-location across staged files.
 */
export function validateWorkspaceModularity(files: Record<string, string>): {
  passed: boolean;
  errors: string[];
} {
  const { checkComponentModularity } = require('./Agent/ProjectChecks');
  return checkComponentModularity(files);
}
