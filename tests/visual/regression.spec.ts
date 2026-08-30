import { expect, test } from '@playwright/test';

test.describe('Zakamurai Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Increase timeout for initial load
    test.setTimeout(120000);

    // Avoid polluted persisted settings (model selection, scope, theme) skewing snapshots.
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore storage access errors in restricted contexts.
      }
    });

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

  test('Welcome prompt download confirmation', async ({ page }) => {
    await page
      .getByRole('textbox', { name: 'Describe what you want to build' })
      .fill('Create a private local task list.');
    await page.getByRole('button', { name: 'Start building with AI' }).click();

    await expect(page.getByRole('heading', { name: 'Download local AI model?' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page).toHaveScreenshot('welcome-model-download-confirmation.png');
  });

  test('Sidebar States', async ({ page }) => {
    // Always use the visible toggle
    const getToggle = () => page.getByTestId('sidebar-toggle').filter({ visible: true });

    // It starts open, let's take a snapshot of open state
    await expect(page).toHaveScreenshot('sidebar-open.png', { animations: 'disabled' });

    // Close it
    await getToggle().click();
    await page.waitForTimeout(1000);
    await page.addStyleTag({
      content: '* { animation: none !important; transition: none !important; }',
    });
    await expect(page).toHaveScreenshot('sidebar-closed.png', { animations: 'disabled' });

    // Toggle back to open for consistency
    await getToggle().click();
    await page.waitForTimeout(400);
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
    const packageFile = page.getByText('package.json');
    if (!(await packageFile.isVisible())) {
      await page.getByTestId('sidebar-toggle').filter({ visible: true }).click();
    }
    await packageFile.click();

    // Wait for breadcrumb to update
    await expect(page.locator('header')).toContainText('package.json');
    const managerInput = page.getByPlaceholder('Tell the AI Manager what to do...');
    if (await managerInput.isVisible()) {
      await page.getByTestId('ai-prompt-toggle').filter({ visible: true }).click();
    }
    await expect(managerInput).not.toBeVisible();

    // Wait for editor to settle (content loading, highlighting)
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot('editor-view.png', {
      mask: [page.locator('textarea')], // Mask the cursor/text if needed, though mostly stable
    });
  });

  test('Logs View', async ({ page }) => {
    const compileBtn = page.getByTestId('compile-btn').filter({ visible: true });
    await compileBtn.click();

    // Wait for Logs tab to appear
    await expect(page.getByTestId('logs-tab').filter({ visible: true })).toBeVisible({
      timeout: 30000,
    });

    // Keep Logs mounted while the build runs so the processing indicator and completion message
    // provide reliable synchronization instead of a fixed delay or button label.
    await page.getByTestId('logs-tab').filter({ visible: true }).click();
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText('Logs');
    await expect(page.locator('[class*="processing"]')).toHaveCount(0, { timeout: 120000 });
    await expect(page.getByText(/Preview ready\./)).toBeVisible({ timeout: 30000 });

    // Compile auto-opens Preview when done; Logs is selected explicitly for this snapshot.
    await expect(page.getByTestId('preview-tab').filter({ visible: true })).toBeVisible({
      timeout: 120000,
    });

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
      mask: [page.locator('[class*="logContainer"]')],
    });
  });

  test('Instructions View', async ({ page }) => {
    // Click Instructions button on Welcome screen
    await page.getByRole('button', { name: 'Instructions' }).click();

    // Wait for the refreshed instructions view to be ready.
    await expect(page.getByText('A focused loop from idea to preview.')).toBeVisible();
    await expect(page.getByText(/Start coding without local setup/)).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('instructions-view.png');

    await page.getByTestId('theme-toggle').filter({ visible: true }).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('instructions-view-light.png');
  });

  test('Project Info View', async ({ page }) => {
    // Click Project info button on Welcome screen
    await page.getByRole('button', { name: 'Project info' }).click();

    // Wait for the refreshed project info view.
    await expect(page.getByText('About the Project')).toBeVisible();
    await expect(page.getByText('Technologies')).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('project-info-view.png');

    await page.getByTestId('theme-toggle').filter({ visible: true }).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('project-info-view-light.png');
  });

  test('Readiness View', async ({ page }) => {
    await page.getByRole('button', { name: 'Show runtime and device readiness' }).click();

    await expect(page.getByRole('heading', { name: 'Runtime & device readiness' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Project compatibility' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Device and AI readiness' })).toBeVisible();

    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('readiness-view.png');

    await page.getByTestId('theme-toggle').filter({ visible: true }).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('readiness-view-light.png');
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

    await page.getByText('New Project', { exact: true }).click();

    // Wait for dialog
    await expect(page.getByText('Are you sure you want to start a new project?')).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('new-project-dialog.png');

    // Close dialog
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Mobile workspace surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mobile-welcome.png', { animations: 'disabled' });

    const toggle = page.getByTestId('sidebar-toggle').filter({ visible: true });
    await toggle.click();
    await expect(page).toHaveScreenshot('mobile-sidebar.png', { animations: 'disabled' });

    await toggle.click();
    await page.getByTestId('ai-prompt-toggle').filter({ visible: true }).click();
    await expect(page.getByPlaceholder('Tell the AI Manager what to do...')).toBeVisible();
    await expect(page).toHaveScreenshot('mobile-agent.png', { animations: 'disabled' });
  });

  test('Narrow mobile workspace has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.waitForTimeout(500);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page).toHaveScreenshot('mobile-narrow-welcome.png', { animations: 'disabled' });
  });
});
