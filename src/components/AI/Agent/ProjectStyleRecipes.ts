export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const roleTokens = (role: string): Set<string> =>
  new Set(
    role
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z\d]+/)
      .filter(Boolean),
  );

export const elementTagsForRole = (source: string, role: string): Set<string> => {
  const escapedRole = escapeRegExp(role);
  const reference = `\\bstyles(?:\\.${escapedRole}\\b|\\[\\s*["']${escapedRole}["']\\s*\\])`;
  return new Set(
    [...source.matchAll(new RegExp(`<([A-Za-z][\\w.]*)\\b[^>]*${reference}`, 'gi'))].map((match) =>
      match[1].toLowerCase(),
    ),
  );
};

const hasRoleToken = (tokens: Set<string>, ...values: string[]): boolean =>
  values.some((value) => tokens.has(value));

/**
 * Small models frequently return reasonable class names without using the
 * semantic role vocabulary in the generation prompt. Infer a safe recipe from
 * the element that owns the class, but never let a substring such as "add" or
 * "app" turn an arbitrary wrapper into a button or a page shell.
 */
export const inferredRecipeForRole = (role: string, source: string): string => {
  const tokens = roleTokens(role);
  const tags = elementTagsForRole(source, role);
  const hasButton = tags.has('button');
  const hasControl = [...tags].some((tag) => ['input', 'select', 'textarea'].includes(tag));

  if (hasButton) {
    if (hasRoleToken(tokens, 'danger', 'delete', 'remove', 'destroy', 'clear'))
      return 'dangerAction';
    if (hasRoleToken(tokens, 'secondary', 'cancel', 'reset', 'ghost')) return 'secondaryAction';
    return 'primaryAction';
  }
  if (hasControl) {
    if (hasRoleToken(tokens, 'checkbox', 'toggle')) return 'checkbox';
    return 'control';
  }
  if (
    tags.has('form') ||
    hasRoleToken(
      tokens,
      'form',
      'field',
      'group',
      'row',
      'toolbar',
      'actions',
      'controls',
      'add',
      'create',
      'save',
      'edit',
      'new',
    )
  )
    return 'form';
  if (tags.has('ul') || tags.has('ol') || hasRoleToken(tokens, 'list', 'lists', 'items'))
    return 'list';
  if (
    tokens.has('app') &&
    !hasRoleToken(
      tokens,
      'header',
      'footer',
      'main',
      'section',
      'list',
      'grid',
      'card',
      'item',
      'form',
      'row',
    )
  )
    return 'app';
  if (
    tags.has('li') ||
    tags.has('article') ||
    hasRoleToken(tokens, 'item', 'entry', 'option', 'card', 'note', 'task', 'todo')
  )
    return 'item';
  if (tags.has('header') || tokens.has('header')) return 'header';
  if (tags.has('footer') || tokens.has('footer')) return 'footer';
  if (tags.has('main') || tags.has('section') || hasRoleToken(tokens, 'main', 'section'))
    return 'section';
  if (hasRoleToken(tokens, 'grid', 'board')) return 'grid';
  if (hasRoleToken(tokens, 'stack', 'content', 'body', 'columns')) return 'stack';
  if (hasRoleToken(tokens, 'title', 'heading')) return 'title';
  if (tokens.has('subtitle')) return 'subtitle';
  if (tokens.has('label')) return 'label';
  if (tokens.has('status')) return 'status';
  if (hasRoleToken(tokens, 'shell', 'wrapper', 'container', 'layout', 'panel')) return 'shell';
  if (hasRoleToken(tokens, 'app', 'root', 'page', 'screen')) return 'app';
  return 'generic';
};

export const ruleForRole = (role: string, source: string): string => {
  const rules: Record<string, string> = {
    app: 'display: grid; gap: clamp(1rem, 3vw, calc(var(--space) * 1.5)); width: min(100%, 72rem); min-height: 100vh; margin: 0 auto; padding: clamp(1rem, 4vw, 3rem); color: var(--color-text); background: var(--color-bg);',
    shell:
      'width: min(100%, 64rem); min-width: 0; margin: 0 auto; display: grid; gap: clamp(1rem, 3vw, calc(var(--space) * 1.5));',
    header:
      'display: flex; min-width: 0; flex-direction: column; gap: calc(var(--space) * 0.75); margin-bottom: var(--space);',
    footer: 'display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: var(--space);',
    section: 'display: grid; min-width: 0; gap: var(--space);',
    stack: 'display: flex; min-width: 0; flex-direction: column; gap: var(--space);',
    row: 'display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: var(--space);',
    grid: 'display: grid; min-width: 0; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: var(--space);',
    board:
      'display: grid; min-width: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space);',
    card: 'min-width: 0; padding: clamp(1rem, 3vw, calc(var(--space) * 1.25)); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); box-shadow: var(--shadow);',
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
      'display: block; box-sizing: border-box; flex: 1 1 18rem; min-width: 0; width: 100%; max-width: 100%; min-height: 2.75rem; padding: calc(var(--space) * 0.7) calc(var(--space) * 0.85); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius);',
    primaryAction:
      'display: inline-flex; width: fit-content; max-width: 100%; min-height: 2.75rem; justify-self: start; align-self: start; align-items: center; justify-content: center; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-on-accent); background: var(--color-accent); border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; font-weight: 600; white-space: nowrap;',
    secondaryAction:
      'display: inline-flex; width: fit-content; max-width: 100%; min-height: 2.75rem; justify-self: start; align-self: start; align-items: center; justify-content: center; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-text); background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius); cursor: pointer; font-weight: 500; white-space: nowrap;',
    dangerAction:
      'display: inline-flex; width: fit-content; max-width: 100%; min-height: 2.75rem; justify-self: start; align-self: start; align-items: center; justify-content: center; padding: calc(var(--space) * 0.7) var(--space); color: var(--color-on-danger); background: var(--color-danger); border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; font-weight: 600; white-space: nowrap;',
    list: 'display: flex; flex-direction: column; gap: calc(var(--space) * 0.6); margin: 0; padding: 0; list-style: none;',
    item: 'display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: var(--space); padding: calc(var(--space) * 0.75) var(--space); color: var(--color-text); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); transition: all var(--duration) var(--easing);',
    checkbox:
      'width: 1.25rem; height: 1.25rem; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0;',
    toggle:
      'width: 1.25rem; height: 1.25rem; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0;',
    form: 'display: flex; min-width: 0; flex-wrap: wrap; gap: var(--space); align-items: center;',
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
  const recipe = inferredRecipeForRole(role, source);
  if (recipe === 'generic')
    return 'display: block; box-sizing: border-box; min-width: 0; max-width: 100%; color: var(--color-text);';
  return (
    rules[recipe] ||
    'display: block; box-sizing: border-box; min-width: 0; max-width: 100%; color: var(--color-text);'
  );
};
