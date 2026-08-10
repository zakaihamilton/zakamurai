import { validateCssModuleRelationships } from '@/components/AI/ChangeValidator';
import type { FileMap } from '@/components/AI/types';

export type ProjectStyleProfileSource = 'inferred' | 'default';

export type ProjectStyleTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  border: string;
  danger: string;
  fontFamily: string;
  spacing: string;
  radius: string;
  shadow: string;
  duration: string;
  easing: string;
};

export type ProjectStyleProfile = {
  source: ProjectStyleProfileSource;
  fingerprint: string;
  tokens: ProjectStyleTokens;
};

export const PROJECT_STYLE_ROLES = [
  'app',
  'shell',
  'section',
  'stack',
  'row',
  'grid',
  'card',
  'title',
  'subtitle',
  'label',
  'muted',
  'status',
  'field',
  'control',
  'primaryAction',
  'secondaryAction',
  'dangerAction',
  'list',
  'item',
  'checkbox',
  'toggle',
  'form',
  'active',
  'selected',
  'completed',
  'error',
  'success',
] as const;

const WARM_LIGHT_TOKENS: ProjectStyleTokens = {
  background: '#f5f1ea',
  surface: '#fffdf8',
  surfaceAlt: '#eee6da',
  text: '#292521',
  muted: '#6f655b',
  accent: '#a4472f',
  onAccent: '#ffffff',
  border: '#d8cdbf',
  danger: '#b42318',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  spacing: '1rem',
  radius: '0.75rem',
  shadow: '0 14px 36px rgb(68 52 39 / 0.12)',
  duration: '160ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const CHARCOAL_DARK_TOKENS: ProjectStyleTokens = {
  background: '#171817',
  surface: '#232522',
  surfaceAlt: '#30332f',
  text: '#f7f3ea',
  muted: '#bbb5aa',
  accent: '#d59a54',
  onAccent: '#20170d',
  border: '#454943',
  danger: '#ff8a80',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  spacing: '1rem',
  radius: '0.75rem',
  shadow: '0 18px 44px rgb(0 0 0 / 0.3)',
  duration: '160ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const hash = (value: string): string => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16);
};

export const fingerprintProjectCss = (files: FileMap): string =>
  hash(
    Object.entries(files)
      .filter(([path]) => /\.css$/i.test(path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => `${path}:${content.length}:${hash(content)}`)
      .join('|'),
  );

const firstCustomProperty = (css: string, names: RegExp[]): string | null => {
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (names.some((name) => name.test(match[1]))) return match[2].trim();
  }
  return null;
};

const valuesByFrequency = (values: string[]): string[] => {
  const counts = new Map<string, { count: number; first: number }>();
  values.forEach((value, index) => {
    const current = counts.get(value);
    counts.set(value, { count: (current?.count || 0) + 1, first: current?.first ?? index });
  });
  return [...counts.entries()]
    .sort(([, left], [, right]) => right.count - left.count || left.first - right.first)
    .map(([value]) => value);
};

const parseHex = (value: string): [number, number, number] | null => {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (!hex) return null;
  const normalized = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join('') : hex;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const luminance = (value: string): number | null => {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const readableTextFor = (background: string): string =>
  (luminance(background) ?? 0.5) < 0.35 ? '#ffffff' : '#20170d';

const inferTokens = (files: FileMap): ProjectStyleTokens | null => {
  const cssEntries = Object.entries(files)
    .filter(([path]) => /\.css$/i.test(path))
    .sort(([left], [right]) => {
      const leftRoot = /(?:^|\/)App\.module\.css$/i.test(left) ? 1 : 0;
      const rightRoot = /(?:^|\/)App\.module\.css$/i.test(right) ? 1 : 0;
      return rightRoot - leftRoot || left.localeCompare(right);
    });
  if (!cssEntries.length) return null;
  const css = cssEntries.map(([, content]) => content).join('\n');
  const colors = valuesByFrequency(
    [...css.matchAll(/#[\da-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()),
  );
  const backgrounds = valuesByFrequency(
    [...css.matchAll(/background(?:-color)?\s*:\s*(#[\da-f]{3,8})\b/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const textColors = valuesByFrequency(
    [...css.matchAll(/(?:^|[;{])\s*color\s*:\s*(#[\da-f]{3,8})\b/gim)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const customBackground = firstCustomProperty(css, [/background|\bbg\b/i]);
  const background = customBackground || backgrounds[0] || colors[0];
  if (!background) return null;
  const dark = (luminance(background) ?? 0.6) < 0.28;
  const fallback = dark ? CHARCOAL_DARK_TOKENS : WARM_LIGHT_TOKENS;
  const accent =
    firstCustomProperty(css, [/accent|primary|brand/i]) ||
    colors.find((color) => color !== background && color !== textColors[0]) ||
    fallback.accent;
  const spacing =
    firstCustomProperty(css, [/spacing|space|gap/i]) ||
    valuesByFrequency(
      [...css.matchAll(/(?:gap|padding)\s*:\s*([\d.]+(?:rem|px))/gi)].map((m) => m[1]),
    )[0] ||
    fallback.spacing;
  const radius =
    firstCustomProperty(css, [/radius/i]) ||
    valuesByFrequency(
      [...css.matchAll(/border-radius\s*:\s*([^;{}]+)/gi)].map((m) => m[1].trim()),
    )[0] ||
    fallback.radius;
  const fontFamily =
    firstCustomProperty(css, [/font.*family|font-sans/i]) ||
    css.match(/font-family\s*:\s*([^;{}]+)/i)?.[1]?.trim() ||
    fallback.fontFamily;
  return {
    ...fallback,
    background,
    surface:
      firstCustomProperty(css, [/surface|panel|card/i]) || backgrounds[1] || fallback.surface,
    surfaceAlt: firstCustomProperty(css, [/surface.*alt|muted.*surface/i]) || fallback.surfaceAlt,
    text:
      firstCustomProperty(css, [/foreground|\btext\b|\bfg\b/i]) || textColors[0] || fallback.text,
    muted: firstCustomProperty(css, [/muted|secondary.*text/i]) || textColors[1] || fallback.muted,
    accent,
    onAccent: firstCustomProperty(css, [/on.*(?:accent|primary)/i]) || readableTextFor(accent),
    border: firstCustomProperty(css, [/border/i]) || fallback.border,
    danger: firstCustomProperty(css, [/danger|error|destructive/i]) || fallback.danger,
    fontFamily,
    spacing,
    radius,
    shadow:
      firstCustomProperty(css, [/shadow/i]) ||
      css.match(/box-shadow\s*:\s*([^;{}]+)/i)?.[1]?.trim() ||
      fallback.shadow,
    duration:
      firstCustomProperty(css, [/duration|transition/i]) ||
      css.match(/\b(\d+(?:\.\d+)?(?:ms|s))\b/)?.[1] ||
      fallback.duration,
  };
};

export const createProjectStyleProfile = (files: FileMap): ProjectStyleProfile => {
  const fingerprint = fingerprintProjectCss(files);
  const inferred = inferTokens(files);
  return {
    source: inferred ? 'inferred' : 'default',
    fingerprint,
    tokens: inferred || WARM_LIGHT_TOKENS,
  };
};

export const resolveProjectStyleProfile = (
  files: FileMap,
  current?: ProjectStyleProfile | null,
): ProjectStyleProfile => {
  const fingerprint = fingerprintProjectCss(files);
  // Do not reuse a persisted profile created by the former override dropdown.
  if (current && (current.source as string) !== 'override' && current.fingerprint === fingerprint) {
    return current;
  }
  return createProjectStyleProfile(files);
};

export const formatProjectStyleContract = (profile: ProjectStyleProfile): string => {
  const { tokens } = profile;
  return [
    `Project style: ${profile.source}.`,
    `Use only semantic CSS Module roles: ${PROJECT_STYLE_ROLES.join(', ')}.`,
    `Tokens: background ${tokens.background}; surface ${tokens.surface}; text ${tokens.text}; muted ${tokens.muted}; accent ${tokens.accent}; spacing ${tokens.spacing}; radius ${tokens.radius}.`,
    'Return component source only. The host generates missing CSS Module rules deterministically.',
  ].join('\n');
};

export const projectStyleRolesForSource = (source: string): string[] =>
  [
    ...new Set(
      [
        ...source.matchAll(
          /\bstyles(?:\.([A-Za-z_-][\w-]*)|\[\s*["']([A-Za-z_-][\w-]*)["']\s*\])/g,
        ),
      ].map((match) => match[1] || match[2]),
    ),
  ].sort();

export const projectStyleRecoveryTrace = (
  files: FileMap,
  recoveredPaths: string[],
  profile?: ProjectStyleProfile,
): Record<string, unknown> | null => {
  if (!profile || !recoveredPaths.length) return null;
  const stylesheetNames = new Set(recoveredPaths.map((path) => path.split('/').pop()));
  const generatedRoles = [
    ...new Set(
      Object.entries(files).flatMap(([path, content]) =>
        /\.(?:jsx|tsx)$/i.test(path) &&
        [...stylesheetNames].some((name) => name && content.includes(name))
          ? projectStyleRolesForSource(content)
          : [],
      ),
    ),
  ].sort();
  return { paths: recoveredPaths, generatedRoles, profileSource: profile.source };
};

export const projectStyleGenerationTrace = (
  path: string,
  source: string,
  profile?: ProjectStyleProfile,
): Record<string, unknown> | null =>
  profile && /\.(?:jsx|tsx)$/i.test(path)
    ? {
        component: path,
        generatedRoles: projectStyleRolesForSource(source),
        profileSource: profile.source,
      }
    : null;

export const repairProjectStyleRelationships = ({
  files,
  targetPath,
  requireCoLocated,
  repair,
}: {
  files: FileMap;
  targetPath: string;
  requireCoLocated: boolean;
  repair: () => string[];
}): { recovered: string[]; remaining: string[] } | null => {
  const options = requireCoLocated ? { requireCoLocatedFor: [targetPath] } : undefined;
  if (!validateCssModuleRelationships(files, options).length) return null;
  const recovered = repair();
  return { recovered, remaining: validateCssModuleRelationships(files, options) };
};

const ruleForRole = (role: string): string => {
  const rules: Record<string, string> = {
    app: 'min-height: 100vh; padding: clamp(1rem, 4vw, 3rem); color: var(--color-text); background: var(--color-bg);',
    shell: 'width: min(100%, 64rem); margin: 0 auto; display: grid; gap: calc(var(--space) * 1.5);',
    section: 'display: grid; gap: var(--space);',
    stack: 'display: flex; flex-direction: column; gap: var(--space);',
    row: 'display: flex; flex-wrap: wrap; align-items: center; gap: var(--space);',
    grid: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--space);',
    board: 'display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space);',
    card: 'padding: calc(var(--space) * 1.25); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); box-shadow: var(--shadow);',
    title:
      'margin: 0; color: var(--color-text); font-size: clamp(2rem, 6vw, 3.75rem); line-height: 1.05; letter-spacing: -0.035em;',
    subtitle:
      'margin: 0; max-width: 65ch; color: var(--color-muted); font-size: 1.05rem; line-height: 1.65;',
    label: 'color: var(--color-text); font-size: 0.875rem; font-weight: 700;',
    muted: 'color: var(--color-muted);',
    status:
      'padding: calc(var(--space) * 0.65) calc(var(--space) * 0.8); color: var(--color-text); background: var(--color-surface-alt); border-radius: var(--radius);',
    field: 'display: grid; gap: calc(var(--space) * 0.4);',
    control:
      'width: 100%; min-height: 2.75rem; padding: calc(var(--space) * 0.7) calc(var(--space) * 0.85); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius);',
    primaryAction:
      'min-height: 2.75rem; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-on-accent); background: var(--color-accent); border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; font-weight: 600;',
    secondaryAction:
      'min-height: 2.75rem; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-text); background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius); cursor: pointer; font-weight: 500;',
    dangerAction:
      'min-height: 2.75rem; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-on-danger); background: var(--color-danger); border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; font-weight: 600;',
    list: 'display: flex; flex-direction: column; gap: calc(var(--space) * 0.6); margin: 0; padding: 0; list-style: none;',
    item: 'display: flex; align-items: center; justify-content: space-between; gap: var(--space); padding: calc(var(--space) * 0.75) var(--space); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); transition: all var(--duration) var(--easing);',
    checkbox:
      'width: 1.25rem; height: 1.25rem; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0;',
    toggle:
      'width: 1.25rem; height: 1.25rem; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0;',
    form: 'display: flex; gap: var(--space); align-items: center;',
    square:
      'aspect-ratio: 1; min-width: 0; padding: var(--space); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); cursor: pointer;',
    cell: 'aspect-ratio: 1; min-width: 0; padding: var(--space); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); cursor: pointer;',
    active: 'outline: 2px solid var(--color-accent); outline-offset: 2px;',
    selected: 'color: var(--color-on-accent); background: var(--color-accent);',
    completed: 'color: var(--color-muted); text-decoration: line-through; opacity: 0.65;',
    error: 'color: var(--color-danger);',
    success: 'color: var(--color-success);',
  };
  if (rules[role]) return rules[role];
  const normalized = role.toLowerCase();
  if (/(?:primary|submit|add|create|save|confirm|new)/.test(normalized)) return rules.primaryAction;
  if (/(?:danger|delete|remove|destroy|clear)/.test(normalized)) return rules.dangerAction;
  if (/(?:secondary|cancel|reset|ghost)/.test(normalized)) return rules.secondaryAction;
  if (/(?:checkbox|toggle|check)/.test(normalized)) return rules.checkbox;
  if (/(?:button|action)/.test(normalized)) return rules.primaryAction;
  if (/(?:input|control|select|textarea)/.test(normalized)) return rules.control;
  if (/(?:form)/.test(normalized)) return rules.form;
  if (/(?:grid|board)/.test(normalized)) return rules.grid;
  if (/(?:item|card)/.test(normalized)) return rules.item;
  if (/(?:cell|square)/.test(normalized)) return rules.square;
  if (/(?:title|heading)/.test(normalized)) return rules.title;
  if (/(?:list|items)/.test(normalized)) return rules.list;
  if (/(?:app|container|wrapper|page|layout)/.test(normalized)) return rules.shell;
  return 'display: block; box-sizing: border-box; color: var(--color-text);';
};

const profileTokenEntries = (profile: ProjectStyleProfile): Array<[string, string]> => {
  const token = profile.tokens;
  const dark = (luminance(profile.tokens.background) ?? 0.6) < 0.28;
  return [
    ['--color-bg', token.background],
    ['--color-surface', token.surface],
    ['--color-surface-alt', token.surfaceAlt],
    ['--color-text', token.text],
    ['--color-muted', token.muted],
    ['--color-accent', token.accent],
    ['--color-on-accent', token.onAccent],
    ['--color-border', token.border],
    ['--color-danger', token.danger],
    ['--color-on-danger', readableTextFor(token.danger)],
    ['--color-success', dark ? '#4ade80' : '#27864a'],
    ['--space', token.spacing],
    ['--radius', token.radius],
    ['--shadow', token.shadow],
    ['--duration', token.duration],
    ['--easing', token.easing],
    ['--font-family', token.fontFamily],
  ];
};

const lastCustomPropertyValue = (css: string, name: string): string | null => {
  const expression = new RegExp(
    `${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;{}]+)`,
    'g',
  );
  let value: string | null = null;
  for (const match of css.matchAll(expression)) value = match[1].trim();
  return value;
};

const rootFoundationPatch = (existingCss: string, profile: ProjectStyleProfile): string | null => {
  const dark = (luminance(profile.tokens.background) ?? 0.6) < 0.28;
  const tokens = profileTokenEntries(profile).filter(([name]) => {
    const current = lastCustomPropertyValue(existingCss, name);
    return current === null;
  });
  const sections: string[] = [];
  const hasRootPresentation =
    /:global\(:root\)\s*\{[^}]*background\s*:\s*var\(--color-bg\)[^}]*color\s*:\s*var\(--color-text\)/s.test(
      existingCss,
    );
  if (tokens.length || !hasRootPresentation) {
    const declarations = tokens.map(([name, value]) => `  ${name}: ${value};`).join('\n');
    sections.push(`:global(:root) {
  color-scheme: ${dark ? 'dark' : 'light'};
${declarations ? `${declarations}\n` : ''}  font-family: var(--font-family);
  background: var(--color-bg);
  color: var(--color-text);
}`);
  }
  if (!/:global\(\*\)[^{]*,[^{]*:global\(\*::before\)/.test(existingCss)) {
    sections.push(`:global(*), :global(*::before), :global(*::after) {
  box-sizing: border-box;
}`);
  }
  if (!/:global\(body\)[^{]*,[^{]*:global\(#root\)/.test(existingCss)) {
    sections.push(`:global(body), :global(#root) {
  margin: 0;
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}`);
  }
  if (!/:global\(button\)[^{]*,[^{]*:global\(input\)/.test(existingCss)) {
    sections.push(`:global(button), :global(input), :global(select), :global(textarea) {
  font: inherit;
}`);
  }
  return sections.length ? sections.join('\n\n') : null;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasSelector = (css: string, role: string, pseudo: string): boolean =>
  new RegExp(`\\.${escapeRegExp(role)}${escapeRegExp(pseudo)}(?:\\b|\\s|:)[^{]*\\{`).test(css);

const interactionRules = (roles: string[], existingCss: string): string => {
  const actionRoles = roles.filter((role) => /Action$|button|btn/i.test(role));
  const controlRoles = roles.filter(
    (role) => role === 'control' || /input|select|textarea/i.test(role),
  );
  const output: string[] = [];
  for (const role of actionRoles) {
    if (!hasSelector(existingCss, role, ':hover')) {
      output.push(
        `.${role}:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }`,
      );
    }
    if (!hasSelector(existingCss, role, ':disabled')) {
      output.push(`.${role}:disabled { cursor: not-allowed; opacity: 0.55; }`);
    }
  }
  for (const role of [...actionRoles, ...controlRoles]) {
    if (!hasSelector(existingCss, role, ':focus-visible')) {
      output.push(
        `.${role}:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-accent) 45%, transparent); outline-offset: 2px; }`,
      );
    }
  }
  return output.join('\n\n');
};

const atRuleBlocks = (css: string, name: string): string => {
  const blocks: string[] = [];
  const expression = new RegExp(`@${name}\\b[^\\{]*\\{`, 'g');
  for (const match of css.matchAll(expression)) {
    let depth = 1;
    let index = (match.index || 0) + match[0].length;
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
    if (depth === 0) blocks.push(css.slice(match.index, index));
  }
  return blocks.join('\n');
};

const selectorDeclares = (css: string, role: string, property: string): boolean => {
  const expression = new RegExp(`\\.${escapeRegExp(role)}[^\\{]*\\{([^}]*)\\}`, 'g');
  for (const match of css.matchAll(expression)) {
    if (new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:`).test(match[1])) return true;
  }
  return false;
};

const responsiveRules = (roles: string[], existingCss: string): string => {
  const mediaCss = atRuleBlocks(existingCss, 'media');
  const declarations: string[] = [];
  if (roles.includes('row') && !selectorDeclares(mediaCss, 'row', 'flex-direction')) {
    declarations.push('  .row { align-items: stretch; flex-direction: column; }');
  }
  if (roles.includes('grid') && !selectorDeclares(mediaCss, 'grid', 'grid-template-columns')) {
    declarations.push('  .grid { grid-template-columns: 1fr; }');
  }
  const responsiveActions = roles.filter(
    (role) =>
      ['primaryAction', 'secondaryAction', 'dangerAction'].includes(role) &&
      !selectorDeclares(mediaCss, role, 'width'),
  );
  if (responsiveActions.length) {
    declarations.push(
      `  ${responsiveActions.map((role) => `.${role}`).join(', ')} { width: 100%; }`,
    );
  }
  return declarations.length ? `@media (width <= 640px) {\n${declarations.join('\n')}\n}` : '';
};

const isRootStylesheet = (path: string): boolean => /(?:^|\/)App\.module\.css$/i.test(path);

export const generateProjectCssModule = ({
  source,
  stylesheetPath,
  profile,
  existingCss = '',
}: {
  source: string;
  stylesheetPath: string;
  profile: ProjectStyleProfile;
  existingCss?: string;
}): string => {
  const roles = projectStyleRolesForSource(source);
  const defined = new Set(
    [...existingCss.matchAll(/\.([A-Za-z_-][\w-]*)\s*(?=[:.{,\s])/g)].map((match) => match[1]),
  );
  const missing = roles.filter((role) => !defined.has(role));
  const additions: string[] = [];
  const foundation = isRootStylesheet(stylesheetPath)
    ? rootFoundationPatch(existingCss, profile)
    : null;
  if (foundation) additions.push(foundation);
  additions.push(...missing.map((role) => `.${role} {\n  ${ruleForRole(role)}\n}`));
  const interactions = interactionRules(roles, existingCss);
  if (interactions) additions.push(interactions);
  const responsive = responsiveRules(roles, existingCss);
  if (responsive) additions.push(responsive);
  if (!existingCss.trim() && !additions.length)
    additions.push('.component {\n  display: block;\n}');
  return `${[existingCss.trimEnd(), ...additions].filter(Boolean).join('\n\n').trimEnd()}\n`;
};

export const ensureProjectRootTokens = (
  files: FileMap,
  profile: ProjectStyleProfile,
): { path: string; content: string } | null => {
  const path = ['src/App.module.css', 'App.module.css'].find((candidate) =>
    Object.hasOwn(files, candidate),
  );
  if (!path) return null;
  const foundation = rootFoundationPatch(files[path], profile);
  if (!foundation) return null;
  return {
    path,
    content: `${files[path].trimEnd()}\n\n${foundation}\n`,
  };
};
