import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const previewOptionLabel = (value: string) =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

async function selectPreviewOption(
  page: import('@playwright/test').Page,
  label: string,
  value: string,
) {
  const dropdown = page.locator('details.ui-preview-dropdown').filter({
    has: page.locator('.ui-preview-dropdown__label', { hasText: new RegExp(`^${label}$`) }),
  });
  await dropdown.locator('summary').click();
  await dropdown.getByRole('button', { name: previewOptionLabel(value), exact: true }).click();
}

test('fixture views are selectable and do not persist edits', async ({ page }) => {
  await page.goto('/ui-preview?screen=editor&scenario=populated&theme=light');
  const stage = page.getByRole('region', { name: 'Preview screen' });
  await expect(stage.getByText('src/App.tsx · synthetic file')).toBeVisible();
  const before = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  await stage.locator('textarea').fill('synthetic edit');
  await selectPreviewOption(page, 'Screen', 'logs');
  await expect(stage.getByText('Preview ready.')).toBeVisible();
  await selectPreviewOption(page, 'Scenario', 'error');
  await expect(stage.getByText(/Compilation error/)).toBeVisible();
  await selectPreviewOption(page, 'Screen', 'editor');
  await expect(stage.locator('textarea')).not.toHaveValue('synthetic edit');
  const after = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  expect(after).toEqual(before);
});

test('welcome submission does not start a model download', async ({ page }) => {
  await page.goto('/ui-preview?screen=welcome');
  await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
  await page.getByRole('textbox', { name: 'Describe what you want to build' }).fill('Build a demo');
  await page.getByRole('button', { name: 'Start building with AI' }).click();
  await expect(page.getByRole('heading', { name: 'Download local AI model?' })).toHaveCount(0);
});

test('review fixtures expose diff, agent, preview and storage states', async ({ page }) => {
  await page.goto('/ui-preview?screen=diff');
  await expect(page.getByText('Review AI Changes:')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Review AI Changes:')).toHaveCount(0);
  await selectPreviewOption(page, 'Screen', 'agent');
  await expect(page.getByText('Update the welcome heading.')).toBeVisible();
  await selectPreviewOption(page, 'Screen', 'preview');
  await selectPreviewOption(page, 'Scenario', 'error');
  await expect(
    page.getByRole('region', { name: 'Preview screen' }).getByRole('alert'),
  ).toContainText('could not be built');
  await selectPreviewOption(page, 'Screen', 'storage');
  await expect(page.getByText(/could not save them/)).toBeVisible();
  await selectPreviewOption(page, 'Screen', 'reasoning');
  await expect(page.getByRole('region', { name: 'Run overview' })).toBeVisible();
});

test('diff and preview error fixtures have no serious accessibility violations', async ({
  page,
}) => {
  for (const screen of ['diff', 'preview']) {
    await page.goto(`/ui-preview?screen=${screen}&scenario=error`);
    await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
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
      await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`screen=${fixture.screen}`));
      const isLightTheme = await page
        .locator('main')
        .evaluate((element) => element.classList.contains('light'));
      expect(isLightTheme).toBe(fixture.theme === 'light');
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await expect(page.getByRole('region', { name: 'Preview screen' })).toHaveScreenshot(
        `fixture-${fixture.screen}-${fixture.scenario}-${fixture.theme}.png`,
        { animations: 'disabled', caret: 'hide' },
      );
    });
  }
});

test('mobile diff keeps review actions visible and stacks labeled editors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ui-preview?screen=diff');
  await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
  const original = page.getByRole('textbox', { name: 'Original code: src/App.tsx' });
  const modified = page.getByRole('textbox', { name: 'Modified code: src/App.tsx' });
  const originalBox = await original.boundingBox();
  const modifiedBox = await modified.boundingBox();
  expect(originalBox).not.toBeNull();
  expect(modifiedBox).not.toBeNull();
  if (!originalBox || !modifiedBox) throw new Error('Diff editors are not visible');
  expect(modifiedBox.y).toBeGreaterThan(originalBox.y);
  for (const name of ['Approve', 'Undo', 'Diff']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error(`${name} is not visible`);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('mobile workspace action controls stay within the screen in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['dark', 'light']) {
    await page.goto(`/ui-preview?screen=workspace&scenario=populated&theme=${theme}`);
    const stage = page.getByRole('region', { name: 'Preview screen' });
    await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
    const isLightTheme = await page
      .locator('main')
      .evaluate((element) => element.classList.contains('light'));
    expect(isLightTheme).toBe(theme === 'light');
    const bounds = await stage.evaluate((element) => {
      const group = element.querySelector('[class*="sidebarToggleGroup"]');
      if (!group) throw new Error('Workspace action controls are missing.');
      const stageRect = element.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      return {
        stageWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        stageRight: stageRect.right,
        groupRight: groupRect.right,
      };
    });
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.stageWidth);
    expect(bounds.groupRight).toBeLessThanOrEqual(bounds.stageRight + 1);
  }
});

test('mobile storage notifications keep gutters and wrap long messages in both themes', async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['dark', 'light']) {
      await page.goto(`/ui-preview?screen=storage&scenario=error&theme=${theme}`);
      await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
      const toast = page.locator('[class*="Notification_toast__"]');
      const container = toast.locator('xpath=..');
      await expect(toast).toBeVisible();
      await page.addStyleTag({
        content:
          '[class*="Notification_toast__"] { animation: none !important; transform: none !important; }',
      });
      const message = toast.locator('[class*="Notification_message__"]');
      await message.evaluate((element) => {
        element.textContent = 'x'.repeat(160);
      });
      const messageWidth = await message.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(messageWidth.scrollWidth).toBeLessThanOrEqual(messageWidth.clientWidth);

      const bounds = await container.evaluate((element) => {
        const containerBounds = element.getBoundingClientRect();
        const toastBounds = element.firstElementChild?.getBoundingClientRect();
        if (!toastBounds) throw new Error('The storage notification is missing.');
        return {
          containerLeft: containerBounds.left,
          containerRight: containerBounds.right,
          toastLeft: toastBounds.left,
          toastRight: toastBounds.right,
        };
      });

      expect(bounds.containerLeft).toBeGreaterThanOrEqual(16);
      expect(bounds.containerRight).toBeLessThanOrEqual(width - 16);
      expect(bounds.toastLeft).toBeGreaterThanOrEqual(bounds.containerLeft);
      expect(bounds.toastRight).toBeLessThanOrEqual(bounds.containerRight);
    }
  }
});

test('run overview responds to pane width and keeps long content inside its container', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/ui-preview?screen=reasoning&scenario=populated&theme=dark');
  const overview = page.getByRole('region', { name: 'Run overview' });
  await expect(overview).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const content = overview.locator('xpath=..');
  const setContainerWidth = async (width: number) => {
    await content.evaluate((element, targetWidth) => {
      const style = getComputedStyle(element);
      const extras =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.borderRightWidth);
      const container = element as HTMLElement;
      container.style.width = `${targetWidth + extras}px`;
      container.style.flex = 'none';
    }, width);
  };
  const assertLayout = async (width: number, mode: 'wide' | 'stacked' | 'narrow') => {
    await setContainerWidth(width);
    const geometry = await overview.evaluate((element) => {
      const statusElement = element.querySelector('[class*="runStatus"]');
      const executionElement = element.querySelector('[aria-label="Live execution"]');
      const grid = element.querySelector('dl');
      if (!statusElement || !executionElement || !grid) {
        throw new Error('Run overview fixture is missing its status, execution, or metrics.');
      }
      const status = statusElement.getBoundingClientRect();
      const execution = executionElement.getBoundingClientRect();
      const metrics = [...grid.children].map((child) => child.getBoundingClientRect());
      const cells = [...element.querySelectorAll('dt, dd')];
      const bounds = element.getBoundingClientRect();
      return {
        status,
        execution,
        metrics,
        metricPairGaps: [...grid.children].map((card) => {
          const label = card.querySelector('dt')?.getBoundingClientRect();
          const value = card.querySelector('dd')?.getBoundingClientRect();
          if (!label || !value) throw new Error('Run overview metric content is missing.');
          return value.top - label.bottom;
        }),
        gridDisplay: getComputedStyle(grid).display,
        overflows: element.scrollWidth > element.clientWidth,
        metricCellsOutside: metrics.some(
          (rect) =>
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.left < bounds.left - 1 ||
            rect.right > bounds.right + 1,
        ),
        metricTextOverflows: cells.some((cell) => cell.scrollWidth > cell.clientWidth + 1),
        childrenOutside: [...element.children]
          .filter((child) => getComputedStyle(child).display !== 'contents')
          .some((child) => {
            const rect = child.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
          }),
      };
    });

    expect(geometry.overflows).toBe(false);
    expect(geometry.metrics).toHaveLength(4);
    expect(geometry.metricCellsOutside).toBe(false);
    expect(geometry.metricTextOverflows).toBe(false);
    expect(geometry.childrenOutside).toBe(false);
    expect(geometry.metricPairGaps.every((gap) => gap <= 12)).toBe(true);
    if (mode === 'wide') {
      expect(Math.abs(geometry.execution.y - geometry.status.y)).toBeLessThan(1);
      expect(geometry.gridDisplay).toBe('contents');
    } else {
      expect(geometry.execution.y).toBeGreaterThan(geometry.status.y);
      expect(geometry.gridDisplay).toBe('grid');
      if (mode === 'stacked') {
        expect(Math.abs(geometry.metrics[0].y - geometry.metrics[1].y)).toBeLessThan(1);
      } else {
        expect(geometry.metrics[0].y).toBeLessThan(geometry.metrics[1].y);
      }
    }

    return geometry;
  };

  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  for (const width of [390, 815, 816, 1280]) {
    await assertLayout(width, width > 815 ? 'wide' : width < 400 ? 'narrow' : 'stacked');
    await expect(overview).toHaveScreenshot(`run-overview-${width}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
  }
  await assertLayout(400, 'stacked');
  await assertLayout(399, 'narrow');

  await setContainerWidth(390);
  await overview
    .locator('dt')
    .first()
    .evaluate((element) => {
      element.textContent = 'A metric label that is longer than the narrow card';
    });
  await overview
    .locator('dd')
    .first()
    .evaluate((element) => {
      element.textContent = 'validation-output-'.repeat(8);
    });
  const longMetricTextOverflows = await overview.evaluate((element) =>
    [...element.querySelectorAll('dt, dd')].some((cell) => cell.scrollWidth > cell.clientWidth + 1),
  );
  expect(longMetricTextOverflows).toBe(false);
});

test('desktop model table shows a horizontal scroll cue when columns overflow', async ({
  page,
}) => {
  for (const width of [900, 1024, 1127, 1128, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ui-preview?screen=models&scenario=populated&theme=dark');
    await expect(page.locator('[data-preview-ready="true"]')).toBeVisible();
    const table = page.locator('[class*="modelTableWrap__"]');
    const hint = page.locator('[class*="tableScrollHint__"]');
    const dimensions = await table.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    const hasHorizontalOverflow = dimensions.scrollWidth > dimensions.clientWidth;

    expect(hasHorizontalOverflow).toBe(width < 1128);
    if (hasHorizontalOverflow) {
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText(/scroll or swipe horizontally/i);
    } else {
      await expect(hint).toBeHidden();
    }
  }
});
