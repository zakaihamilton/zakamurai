import { DEFAULT_CONTENTS } from '@/components/Storage/InitialData';
import { describe, expect, it } from 'vitest';
import {
  createProjectStyleProfile,
  formatProjectStyleContract,
  generateProjectCssModule,
  resolveProjectStyleProfile,
} from './ProjectStyleProfile';

describe('ProjectStyleProfile', () => {
  it('uses the stable warm profile for an unstyled scratch project', () => {
    const profile = createProjectStyleProfile({ 'src/App.jsx': 'export default null' });
    expect(profile).toMatchObject({ source: 'default' });
    expect(profile.tokens).toMatchObject({ background: '#f5f1ea', accent: '#a4472f' });
  });

  it('prefers project custom properties when inferring tokens', () => {
    const profile = createProjectStyleProfile({
      'src/App.module.css': `:root {
        --color-bg: #101418;
        --color-surface: #202830;
        --color-text: #f4f6f8;
        --color-accent: #d18b47;
        --radius: 18px;
      }`,
    });
    expect(profile.source).toBe('inferred');
    expect(profile.tokens).toMatchObject({
      background: '#101418',
      surface: '#202830',
      text: '#f4f6f8',
      accent: '#d18b47',
      radius: '18px',
    });
  });

  it('uses the neutral default profile for the basic starter', () => {
    const profile = createProjectStyleProfile(DEFAULT_CONTENTS);
    expect(profile).toMatchObject({ source: 'default' });
    expect(profile.tokens).toMatchObject({
      background: '#f5f1ea',
      accent: '#a4472f',
    });
  });

  it('refreshes after CSS changes and discards persisted legacy overrides', () => {
    const files = { 'src/App.module.css': ':root { --color-bg: #ffffff; }' };
    const legacyOverride = {
      ...createProjectStyleProfile(files),
      source: 'override',
      preference: 'charcoal-dark',
    } as unknown as ReturnType<typeof createProjectStyleProfile>;
    const replacement = resolveProjectStyleProfile(files, legacyOverride);
    expect(replacement).not.toBe(legacyOverride);
    expect(replacement).toMatchObject({ source: 'inferred' });

    const inferred = createProjectStyleProfile(files);
    const refreshed = resolveProjectStyleProfile(
      { 'src/App.module.css': ':root { --color-bg: #111111; }' },
      inferred,
    );
    expect(refreshed).not.toBe(inferred);
    expect(refreshed.tokens.background).toBe('#111111');
  });

  it('generates byte-stable tokenized CSS from semantic roles', () => {
    const profile = createProjectStyleProfile({});
    const first = generateProjectCssModule({
      source:
        'import styles from "./App.module.css"; export default () => <main className={styles.app}><button className={styles.primaryAction}>Save</button><div className={styles.grid} /></main>;',
      stylesheetPath: 'src/App.module.css',
      profile,
    });
    const second = generateProjectCssModule({
      source:
        'import styles from "./App.module.css"; export default () => <main className={styles.grid}><button className={styles.primaryAction} /><div className={styles.app} /></main>;',
      stylesheetPath: 'src/App.module.css',
      profile,
    });
    expect(second).toBe(first);
    expect(first).toContain('--color-accent: #a4472f');
    expect(first).toContain('var(--color-accent)');
    expect(first).toContain(':focus-visible');
    expect(first).toContain('@media (width <= 640px)');
  });

  it('adds the responsive generation contract only when requested', () => {
    const profile = createProjectStyleProfile({});
    expect(formatProjectStyleContract(profile)).not.toContain('320px, 375px, 768px, and 1440px');
    expect(formatProjectStyleContract(profile, { responsive: true })).toContain(
      '320px, 375px, 768px, and 1440px',
    );
  });

  it('preserves authored declarations and adds only missing selectors', () => {
    const profile = createProjectStyleProfile({});
    const css = generateProjectCssModule({
      source:
        'import styles from "./Card.module.css"; export default () => <div className={styles.card}><p className={styles.muted}>Text</p></div>;',
      stylesheetPath: 'src/components/Card.module.css',
      profile,
      existingCss: '.card { color: rebeccapurple; }',
    });
    expect(css).toContain('.card { color: rebeccapurple; }');
    expect(css.match(/\.card\s*\{/g)).toHaveLength(1);
    expect(css).toContain('.muted');
    expect(css).not.toContain(':global(:root)');
  });

  it('fills a partial root token foundation without replacing authored token values', () => {
    const existingCss = ':global(:root) { --color-bg: #101418; }\n.app { min-height: 100vh; }';
    const css = generateProjectCssModule({
      source:
        'import styles from "./App.module.css"; export default () => <main className={styles.app}><input className={styles.control} /></main>;',
      stylesheetPath: 'src/App.module.css',
      profile: createProjectStyleProfile({ 'src/App.module.css': existingCss }),
      existingCss,
    });
    expect(css.match(/--color-bg\s*:/g)).toHaveLength(1);
    expect(css).toContain('--color-surface:');
    expect(css).toContain('--color-text:');
    expect(css).toContain('--font-family:');
    expect(css).toContain('background: var(--color-bg)');
  });

  it('keeps inferred root tokens idempotent', () => {
    const source =
      'import styles from "./App.module.css"; export default () => <main className={styles.app} />;';
    const warm = generateProjectCssModule({
      source,
      stylesheetPath: 'src/App.module.css',
      profile: createProjectStyleProfile({}),
    });
    expect(
      generateProjectCssModule({
        source,
        stylesheetPath: 'src/App.module.css',
        profile: createProjectStyleProfile({ 'src/App.module.css': warm }),
        existingCss: warm,
      }),
    ).toBe(warm);
  });

  it('fills interaction states per role when another focus rule is already authored', () => {
    const existingCss = `.primaryAction { display: block; }
.primaryAction:focus-visible { outline: 2px solid currentColor; }
.control { display: block; }`;
    const css = generateProjectCssModule({
      source:
        'import styles from "./Form.module.css"; export default () => <><button className={styles.primaryAction}>Save</button><input className={styles.control} /></>;',
      stylesheetPath: 'src/components/Form.module.css',
      profile: createProjectStyleProfile({}),
      existingCss,
    });
    expect(css.match(/\.primaryAction:focus-visible/g)).toHaveLength(1);
    expect(css).toContain('.primaryAction:hover:not(:disabled)');
    expect(css).toContain('.primaryAction:disabled');
    expect(css).toContain('.control:focus-visible');
  });

  it('emits responsive selectors only for roles referenced by the component', () => {
    const css = generateProjectCssModule({
      source:
        'import styles from "./Feature.module.css"; export default () => <div className={styles.shell}><button className={styles.primaryAction}>Save</button></div>;',
      stylesheetPath: 'src/components/Feature.module.css',
      profile: createProjectStyleProfile({}),
    });
    const media = css.slice(css.indexOf('@media'));
    expect(media).toContain('.primaryAction');
    expect(media).not.toContain('.row');
    expect(media).not.toContain('.grid');
    expect(media).not.toContain('.secondaryAction');
    expect(media).not.toContain('.dangerAction');
  });

  it('generates fluid and mobile-safe recipes for dashboard-style layouts', () => {
    const css = generateProjectCssModule({
      source:
        "import styles from './Dashboard.module.css'; export default () => <main className={styles.shell}><form className={styles.form}><input className={styles.control} /><button className={styles.primaryAction}>Add</button></form><div className={styles.grid}><article className={styles.card}>Card</article></div></main>;",
      stylesheetPath: 'src/Dashboard.module.css',
      profile: createProjectStyleProfile({}),
    });
    expect(css).toContain('min-width: 0');
    expect(css).toContain('repeat(auto-fit, minmax(min(100%, 14rem), 1fr))');
    expect(css).toContain('clamp(');
    expect(css).toContain('@media (width <= 640px)');
    expect(css).toContain('.form { align-items: stretch; flex-direction: column; }');
    expect(css).toContain('.primaryAction { width: 100%; }');
    expect(css).not.toMatch(/\.card\s*\{[^}]*\bheight\s*:/s);
  });

  it('keeps generated pages bounded and controls fluid across generic layouts', () => {
    const css = generateProjectCssModule({
      source:
        "import styles from './App.module.css'; export default () => <main className={styles.app}><form className={styles.form}><input className={styles.control} /><button className={styles.primaryAction}>Save</button></form><footer className={styles.shell}><button className={styles.secondaryAction}>Cancel</button><button className={styles.dangerAction}>Delete</button></footer></main>;",
      stylesheetPath: 'src/App.module.css',
      profile: createProjectStyleProfile({}),
    });
    expect(css).toContain('width: min(100%, 72rem)');
    expect(css).toContain('flex: 1 1 18rem');
    expect(css).toContain('.shell:has(> .dangerAction + .primaryAction');
    expect(css).toContain(
      '.shell > .dangerAction, .shell > .primaryAction, .shell > .secondaryAction',
    );
  });

  it('does not flatten a shell that contains only one action', () => {
    const css = generateProjectCssModule({
      source:
        "import styles from './App.module.css'; export default () => <main className={styles.shell}><h1 className={styles.title}>Title</h1><section className={styles.section}>Content</section><button className={styles.primaryAction}>Save</button></main>;",
      stylesheetPath: 'src/App.module.css',
      profile: createProjectStyleProfile({}),
    });
    expect(css).not.toContain(':has(> .primaryAction + .primaryAction)');
  });

  it.each([
    {
      name: 'form',
      roles: ['field', 'control', 'primaryAction', 'error'],
      expected: ['width: 100%', ':focus-visible', ':disabled'],
    },
    {
      name: 'collection states',
      roles: ['list', 'item', 'selected', 'completed', 'success'],
      expected: ['list-style: none', 'text-decoration: line-through', '--color-success'],
    },
    {
      name: 'responsive grid',
      roles: ['shell', 'grid', 'card', 'secondaryAction'],
      expected: ['repeat(auto-fit', '@media (width <= 640px)', '--shadow'],
    },
    {
      name: 'game board',
      roles: ['board', 'cell', 'status', 'dangerAction'],
      expected: ['repeat(3', 'aspect-ratio: 1', '--color-danger'],
    },
  ])('generates the deterministic $name recipe', ({ roles, expected }) => {
    const references = roles.map((role) => `<div className={styles.${role}} />`).join('');
    const css = generateProjectCssModule({
      source: `import styles from './Feature.module.css'; export default () => <>${references}</>;`,
      stylesheetPath: 'src/components/Feature.module.css',
      profile: createProjectStyleProfile({}),
    });
    for (const fragment of expected) expect(css).toContain(fragment);
  });
});
