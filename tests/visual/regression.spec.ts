import { expect, test } from '@playwright/test';

test.describe('Zakamurai Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Increase timeout for initial load
    test.setTimeout(120000);

    // Use relative path to leverage baseURL from config
    await page.goto('/');

    // Wait for the initialization to complete
    const initializing = page.getByText('Initializing workspace...');
    await expect(initializing).not.toBeVisible({ timeout: 60000 });

    // Wait for the main UI to be ready
    const sidebarToggle = page.getByTestId('sidebar-toggle').filter({ visible: true });
    await expect(sidebarToggle).toBeVisible({ timeout: 30000 });

    // Wait for any animations to settle
    await page.waitForTimeout(2000);
  });

  test('Welcome Screen', async ({ page }) => {
    await expect(page).toHaveScreenshot('welcome-screen.png');
  });

  test('Sidebar States', async ({ page }) => {
    // Always use the visible toggle
    const getToggle = () => page.getByTestId('sidebar-toggle').filter({ visible: true });

    // It starts open, let's take a snapshot of open state
    await expect(page).toHaveScreenshot('sidebar-open.png');

    // Close it
    await getToggle().click();
    await page.waitForTimeout(1000); // Wait for transition
    await expect(page).toHaveScreenshot('sidebar-closed.png');

    // Toggle back to open for consistency
    await getToggle().click();
    await page.waitForTimeout(1000);
  });

  test('Theme States', async ({ page }) => {
    const themeToggle = page.getByTestId('theme-toggle').filter({ visible: true });

    // Initial state (Dark mode by default usually)
    await expect(page).toHaveScreenshot('theme-initial.png');

    // Toggle theme
    await themeToggle.click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('theme-toggled.png');

    // Toggle back for consistency
    await themeToggle.click();
    await page.waitForTimeout(1000);
  });

  test('Editor View', async ({ page }) => {
    // Open package.json from sidebar
    await page.getByText('package.json').click();

    // Wait for breadcrumb to update
    await expect(page.locator('header')).toContainText('package.json');

    // Wait for editor to settle (content loading, highlighting)
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot('editor-view.png', {
      mask: [page.locator('textarea')], // Mask the cursor/text if needed, though mostly stable
    });
  });

  test('Logs View', async ({ page }) => {
    const compileBtn = page.getByTestId('compile-btn').filter({ visible: true });
    await compileBtn.click();

    // Wait for Logs tab to appear and be active
    await expect(page.getByTestId('logs-tab').filter({ visible: true })).toBeVisible();

    // Wait for some log output to appear and settle
    await page.waitForTimeout(5000);

    // Inject style to stop any animations and hide dynamic bits
    await page.addStyleTag({
      content: `
        * { animation: none !important; transition: none !important; }
        [class*="timestamp"], [class*="processing"], [class*="logContent"] { 
          visibility: hidden !important; 
        }
      `,
    });

    await expect(page).toHaveScreenshot('logs-view.png', {
      animations: 'disabled',
    });
  });

  test('Instructions View', async ({ page }) => {
    // Click Instructions button on Welcome screen
    await page.getByRole('button', { name: 'Instructions' }).click();

    // Wait for instructions tab - using the actual title from Instructions.js
    await expect(page.getByText('Welcome to Zakamurai')).toBeVisible();
    await expect(
      page.getByText('Master your browser-based IDE with this quick guide.'),
    ).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('instructions-view.png');
  });

  test('Project Info View', async ({ page }) => {
    // Click Project info button on Welcome screen
    await page.getByRole('button', { name: 'Project info' }).click();

    // Wait for project info tab - using text from ProjectInfo.js
    await expect(page.getByText('About the Project')).toBeVisible();
    await expect(page.getByText('Technologies')).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('project-info-view.png');
  });

  test('Dialogs - Keyboard Shortcuts', async ({ page }) => {
    // Open the "More actions" menu
    await page.getByTestId('more-actions-btn').filter({ visible: true }).click();

    // Click Keyboard Shortcuts in the menu
    await page.getByText('Keyboard Shortcuts').click();

    // Wait for dialog
    await expect(page.locator('h2').filter({ hasText: 'Keyboard Shortcuts' })).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('keyboard-shortcuts-dialog.png');

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('Dialogs - New Project', async ({ page }) => {
    await page.getByTestId('more-actions-btn').filter({ visible: true }).click();

    // Click New Project in the menu (exact match to avoid "New Project from Scratch")
    await page.getByText('New Project', { exact: true }).click();

    // Wait for dialog
    await expect(page.getByText('Are you sure you want to start a new project?')).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('new-project-dialog.png');

    // Close dialog
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});
