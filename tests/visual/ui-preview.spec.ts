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
  const assertLayout = async (width: number, mode: 'wide' | 'narrow') => {
    await setContainerWidth(width);
    const geometry = await overview.evaluate((element) => {
      const heading = element.querySelector('[class*="overviewHeading"]');
      const statusElement = element.querySelector('[class*="runStatus"]');
      const requestElement = element.querySelector('[class*="runRequest"]');
      const roadmap = element.querySelector('[aria-label="Run stages"]');
      const executionElement = element.querySelector('[aria-label="Live execution"]');
      if (!heading || !statusElement || !requestElement || !roadmap || !executionElement) {
        throw new Error('Run overview fixture is missing its heading, roadmap, or live execution.');
      }
      const bounds = element.getBoundingClientRect();
      const contained = (child: Element) => {
        const rect = child.getBoundingClientRect();
        return rect.width > 0 && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      };
      return {
        status: statusElement.getBoundingClientRect(),
        request: requestElement.getBoundingClientRect(),
        headingDirection: getComputedStyle(heading).flexDirection,
        stageLabels: [...roadmap.querySelectorAll('[class*="roadmapLabel"]')].map(
          (label) => label.textContent,
        ),
        stagesContained: [...roadmap.querySelectorAll('li')].every(contained),
        executionContained: contained(executionElement),
        overflows: element.scrollWidth > element.clientWidth,
        childrenOutside: [...element.children]
          .filter((child) => getComputedStyle(child).display !== 'contents')
          .some((child) => !contained(child)),
      };
    });

    expect(geometry.overflows).toBe(false);
    expect(geometry.stageLabels).toEqual(['Request', 'Context', 'Work', 'Validate', 'Result']);
    expect(geometry.stagesContained).toBe(true);
    expect(geometry.executionContained).toBe(true);
    expect(geometry.childrenOutside).toBe(false);
    expect(geometry.headingDirection).toBe(mode === 'wide' ? 'row' : 'column');
    if (mode === 'narrow') {
      expect(geometry.request.y).toBeGreaterThan(geometry.status.y);
    }
  };

  for (const width of [390, 559, 560, 561, 1280]) {
    await assertLayout(width, width > 560 ? 'wide' : 'narrow');
  }

  await setContainerWidth(390);
  const longText = 'request-without-spaces-'.repeat(20);
  await overview.locator('[class*="runRequest"]').evaluate((element, text) => {
    element.textContent = `Request: ${text}`;
  }, longText);
  await overview.locator('[class*="liveDetail"]').evaluate((element, text) => {
    element.textContent = text;
  }, longText);
  const longTextOverflows = await overview.evaluate((element) =>
    [...element.querySelectorAll('[class*="runRequest"], [class*="liveDetail"]')].some(
      (node) => node.scrollWidth > node.clientWidth + 1,
    ),
  );
  expect(longTextOverflows).toBe(false);
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
