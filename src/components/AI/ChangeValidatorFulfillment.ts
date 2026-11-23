import { hasReachableCollectionEntryFlow } from './ChangeValidatorCollection';
import { isAppEntryPath } from './ChangeValidatorSourceShape';
import { validateInteractiveStyles } from './ChangeValidatorStyles';
import { stripComments } from './ChangeValidatorSyntax';
import { validateDeclaredFunctionCalls } from './DeclaredFunctionValidator';

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

  const functionError = validateDeclaredFunctionCalls(path, content);
  if (functionError) return functionError;

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
  const hasEntryFlow = hasCollectionTextEntry(content) && hasCollectionAddControl(content);
  if (
    isEmptyMappedCollection &&
    ((!hasEntryFlow && !hasVisibleEmptyState(content)) ||
      (hasEntryFlow && !hasReachableCollectionEntryFlow(content)))
  ) {
    return `Generated content for ${path} renders an empty collection without a reachable entry flow or clear empty state. Keep a visible input or textarea with a controlled value and a create/add/submit control reachable from the initial empty state, or tell the user what to do next when the collection has no items.`;
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
