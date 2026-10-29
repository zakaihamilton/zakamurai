import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('fixture views are selectable and do not persist edits', async ({ page }) => {
  await page.goto('/ui-preview?screen=editor&scenario=populated&theme=light');
  const stage = page.getByRole('region', { name: 'Preview screen' });
  await expect(stage.getByText('src/App.tsx · synthetic file')).toBeVisible();
  const before = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  await stage.locator('textarea').fill('synthetic edit');
  await page.getByRole('combobox', { name: 'Screen' }).selectOption('logs');
  await expect(stage.getByText('Preview ready.')).toBeVisible();
  await page.getByLabel('Scenario').selectOption('error');
  await expect(stage.getByText(/Compilation error/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Screen' }).selectOption('editor');
  await expect(stage.locator('textarea')).not.toHaveValue('synthetic edit');
  const after = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  expect(after).toEqual(before);
});

test('welcome submission does not start a model download', async ({ page }) => {
  await page.goto('/ui-preview?screen=welcome');
  await page.getByRole('textbox', { name: 'Describe what you want to build' }).fill('Build a demo');
  await page.getByRole('button', { name: 'Start building with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Download local AI model?' })).toHaveCount(0);
});

test('review fixtures expose diff, agent, preview and storage states', async ({ page }) => {
  await page.goto('/ui-preview?screen=diff');
  await expect(page.getByText('Review AI Changes:')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Review AI Changes:')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Screen' }).selectOption('agent');
  await expect(page.getByText('Update the welcome heading.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Screen' }).selectOption('preview');
  await page.getByLabel('Scenario').selectOption('error');
  await expect(
    page.getByRole('region', { name: 'Preview screen' }).getByRole('alert'),
  ).toContainText('could not be built');
  await page.getByRole('combobox', { name: 'Screen' }).selectOption('storage');
  await expect(page.getByText(/could not save them/)).toBeVisible();
});

test('diff and preview error fixtures have no serious accessibility violations', async ({
  page,
}) => {
  for (const screen of ['diff', 'preview']) {
    await page.goto(`/ui-preview?screen=${screen}&scenario=error`);
    await expect(page.getByRole('combobox', { name: 'Screen' })).toHaveValue(screen);
    const result = await new AxeBuilder({ page })
      .include('[aria-label="Preview screen"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  }
});

test.describe('UI preview visual regression', () => {
  // Linux baselines must be generated on the CI platform before enabling these snapshots there.
  test.skip(
    process.platform !== 'darwin' && process.env.UPDATE_UI_PREVIEW_SNAPSHOTS !== '1',
    'UI preview screenshot baselines are available on macOS only',
  );
  const cases = [
    { screen: 'workspace', scenario: 'populated', theme: 'dark' },
    { screen: 'diff', scenario: 'populated', theme: 'dark' },
    { screen: 'agent', scenario: 'error', theme: 'dark' },
    { screen: 'preview', scenario: 'error', theme: 'light' },
  ];

  for (const fixture of cases) {
    test(`${fixture.screen} ${fixture.scenario} ${fixture.theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      const params = new URLSearchParams(fixture);
      await page.goto(`/ui-preview?${params}`);
      await expect(page.getByRole('combobox', { name: 'Screen' })).toHaveValue(fixture.screen);
      await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue(fixture.theme);
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await expect(page.getByRole('region', { name: 'Preview screen' })).toHaveScreenshot(
        `fixture-${fixture.screen}-${fixture.scenario}-${fixture.theme}.png`,
        { animations: 'disabled', caret: 'hide' },
      );
    });
  }
});
