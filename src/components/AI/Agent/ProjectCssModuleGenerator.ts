import type { FileMap } from '@/components/AI/types';
import { type ProjectStyleProfile, luminance, readableTextFor } from './ProjectStyleInference';
import {
  elementTagsForRole,
  escapeRegExp,
  inferredRecipeForRole,
  projectStyleRolesForSource,
  ruleForRole,
} from './ProjectStyleRecipes';

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
  const expression = new RegExp(`${escapeRegExp(name)}\\s*:\\s*([^;{}]+)`, 'g');
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

const hasSelector = (css: string, role: string, pseudo: string): boolean =>
  new RegExp(`\\.${escapeRegExp(role)}${escapeRegExp(pseudo)}(?:\\b|\\s|:)[^{]*\\{`).test(css);

const interactionRules = (roles: string[], existingCss: string, source: string): string => {
  const actionRoles = roles.filter(
    (role) => /Action$|button|btn/i.test(role) || elementTagsForRole(source, role).has('button'),
  );
  const controlRoles = roles.filter(
    (role) =>
      role === 'control' ||
      /input|select|textarea/i.test(role) ||
      [...elementTagsForRole(source, role)].some((tag) =>
        ['input', 'select', 'textarea'].includes(tag),
      ),
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

const compositionRules = (roles: string[], existingCss: string, source: string): string => {
  const output: string[] = [];
  if (
    roles.includes('control') &&
    roles.includes('form') &&
    !existingCss.includes('.form .control')
  ) {
    output.push('.form .control { flex: 1 1 18rem; min-width: 0; }');
  }
  if (
    roles.includes('control') &&
    roles.includes('row') &&
    !existingCss.includes('.row .control')
  ) {
    output.push('.row .control { flex: 1 1 18rem; min-width: 0; }');
  }
  const actionRoles = roles.filter((role) => /(?:Action$|button|btn)/i.test(role));
  if (roles.includes('shell') && actionRoles.length && !existingCss.includes(':has(>')) {
    const actionReferenceCounts = new Map(
      actionRoles.map((role) => [
        role,
        (
          source.match(
            new RegExp(
              `\\bstyles(?:\\.${escapeRegExp(role)}|\\[\\s*["']${escapeRegExp(role)}["']\\s*\\])`,
              'g',
            ),
          ) || []
        ).length,
      ]),
    );
    const directActionPairs = actionRoles.flatMap((left) =>
      actionRoles
        .filter((right) => left !== right || (actionReferenceCounts.get(left) || 0) > 1)
        .map((right) => `> .${left} + .${right}`),
    );
    const directActions = directActionPairs.join(', ');
    const actionChildren = actionRoles.map((role) => `.shell > .${role}`).join(', ');
    if (directActions) {
      output.push(
        `.shell:has(${directActions}) { display: flex; flex-wrap: wrap; align-items: center; }`,
        `${actionChildren} { flex: 0 1 auto; }`,
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

const responsiveRules = (roles: string[], existingCss: string, source: string): string => {
  const mediaCss = atRuleBlocks(existingCss, 'media');
  const declarations: string[] = [];
  const stackRoles = roles.filter(
    (role) =>
      (['row', 'form'].includes(role) ||
        ['row', 'form'].includes(inferredRecipeForRole(role, source))) &&
      !selectorDeclares(mediaCss, role, 'flex-direction'),
  );
  if (stackRoles.length) {
    declarations.push(
      `  ${stackRoles.map((role) => `.${role}`).join(', ')} { align-items: stretch; flex-direction: column; }`,
    );
  }
  if (roles.includes('grid') && !selectorDeclares(mediaCss, 'grid', 'grid-template-columns')) {
    declarations.push('  .grid { grid-template-columns: 1fr; }');
  }
  const responsiveActions = roles.filter(
    (role) =>
      (['primaryAction', 'secondaryAction', 'dangerAction'].includes(role) ||
        /button|btn|action/i.test(role) ||
        elementTagsForRole(source, role).has('button')) &&
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
  additions.push(...missing.map((role) => `.${role} {\n  ${ruleForRole(role, source)}\n}`));
  const interactions = interactionRules(roles, existingCss, source);
  if (interactions) additions.push(interactions);
  const compositions = compositionRules(roles, existingCss, source);
  if (compositions) additions.push(compositions);
  const responsive = responsiveRules(roles, existingCss, source);
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
