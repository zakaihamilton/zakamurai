import { expect, test } from '@playwright/test';

test.describe('Zakamurai Advanced Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
    await page.waitForSelector('[data-testid]', { state: 'visible', timeout: 30000 });
  });

  test('should toggle theme', async ({ page }) => {
    const body = page.locator('body');
    const themeToggle = page.getByTestId('theme-toggle').filter({ visible: true });
    const initialClass = await body.evaluate((el) => el.className);
    await themeToggle.click();
    const newClass = await body.evaluate((el) => el.className);
    expect(newClass).not.toBe(initialClass);
  });

  test('should open keyboard shortcuts dialog', async ({ page }) => {
    await page.getByTestId('more-actions-btn').filter({ visible: true }).click();
    await page.getByText('Keyboard Shortcuts').click();
    await expect(page.locator('h2').filter({ hasText: 'Keyboard Shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('h2').filter({ hasText: 'Keyboard Shortcuts' })).not.toBeVisible();
  });

  test('should open a file from the sidebar', async ({ page }) => {
    await page.getByText('package.json').click();
    await expect(page.locator('header')).toContainText('package.json');
  });

  test('should show project info', async ({ page }) => {
    await page.getByText('Project info').click();
    await expect(page.getByText('About the Project')).toBeVisible();

    await page.locator('header').getByText('Zakamur', { exact: false }).first().click();
    await expect(page.getByText('Project info')).toBeVisible({ timeout: 10000 });
  });

  test('should show new project confirmation dialog', async ({ page }) => {
    await page.getByTestId('more-actions-btn').filter({ visible: true }).click();
    await page.getByText('New Project', { exact: true }).click();
    await expect(page.getByText('Are you sure you want to start a new project?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Are you sure you want to start a new project?')).not.toBeVisible();
  });
});

test.describe('Zakamurai Navigation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
    await page.waitForSelector('[data-testid]', { state: 'visible', timeout: 30000 });
  });

  test('should switch between code, logs, and preview tabs', async ({ page }) => {
    await page.getByText('package.json').click();
    await expect(page.locator('header')).toContainText('package.json');

    await page.getByTestId('logs-tab').filter({ visible: true }).click();
    await expect(page.getByTestId('logs-tab').filter({ visible: true })).toHaveClass(/activeTab/);

    await page.getByTestId('preview-tab').filter({ visible: true }).click();
    await expect(page.getByTestId('preview-tab').filter({ visible: true })).toHaveClass(
      /activeTab/,
    );

    await page.getByTestId('code-tab').filter({ visible: true }).click();
    await expect(page.getByTestId('code-tab').filter({ visible: true })).toHaveClass(/activeTab/);
    await expect(page.locator('header')).toContainText('package.json');
  });

  test('should expose navigation controls in the top bar', async ({ page }) => {
    const backButton = page.getByTestId('go-back-button').filter({ visible: true });
    const forwardButton = page.getByTestId('go-forward-button').filter({ visible: true });
    const historyButton = page.getByTestId('history-dropdown-button').filter({ visible: true });

    await expect(backButton).toBeVisible();
    await expect(forwardButton).toBeVisible();
    await expect(historyButton).toBeVisible();
    await expect(backButton).toBeDisabled();
    await expect(forwardButton).toBeDisabled();
    await expect(historyButton).toBeDisabled();

    await page.getByText('package.json').click();
    await expect(page.locator('header')).toContainText('package.json');
    await page.getByText('vite.config.js').click();
    await expect(page.locator('header')).toContainText('vite.config.js');
  });

  test('should filter sidebar files via search', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search files/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('package.json');
    await expect(page.getByText('package.json', { exact: true })).toBeVisible();
  });

  test('should toggle Agent panel', async ({ page }) => {
    const textarea = page.getByPlaceholder('Tell the Agent what to do...');
    await expect(textarea).toBeVisible();

    await page.getByTestId('ai-prompt-toggle').filter({ visible: true }).click();
    await expect(textarea).not.toBeVisible({ timeout: 5000 });

    await page.getByTestId('ai-prompt-toggle').filter({ visible: true }).click();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });
});
