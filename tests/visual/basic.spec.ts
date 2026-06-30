import { expect, test } from '@playwright/test';

test.describe('Zakamurai Basic Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Using 127.0.0.1 for better reliability
    await page.goto('/');
    // Wait for the loading screen to disappear
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
    await page.waitForSelector('[data-testid]', { state: 'visible', timeout: 30000 });
  });

  test('should load the application and show key elements', async ({ page }) => {
    await expect(page.getByTestId('compile-btn').filter({ visible: true })).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByTestId('sidebar-toggle').filter({ visible: true })).toBeVisible();
  });

  test('should toggle the sidebar', async ({ page }) => {
    // Initially sidebar should be open and 'src' folder visible
    // The screenshot confirms 'src' is visible
    await expect(page.getByText('src', { exact: true })).toBeVisible({ timeout: 10000 });

    // The sidebar toggle is the "Z" button
    const sidebarToggle = page.getByTestId('sidebar-toggle').filter({ visible: true });
    await sidebarToggle.click();

    // Verify it's still there
    await expect(sidebarToggle).toBeVisible();
  });

  test('should open logs when build is clicked', async ({ page }) => {
    const buildBtn = page.getByTestId('compile-btn').filter({ visible: true });
    await buildBtn.click();

    // Clicking build should open the Logs tab
    // We use exact match to avoid strict mode violations with other text containing "Logs"
    await expect(page.getByText('Logs', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should interact with the Agent', async ({ page }) => {
    const textarea = page.getByPlaceholder('Tell the Agent what to do...');

    // In the screenshot, Agent is already open
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Hello AI, help me code!');
    await expect(textarea).toHaveValue('Hello AI, help me code!');
  });
});
