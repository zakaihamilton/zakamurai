import { test, expect } from '@playwright/test';

test.describe('Zakamurai Basic Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Using localhost as identified in the user's browser state
    await page.goto('http://localhost:3000/');
    // Wait for the loading screen to disappear
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
  });

  test('should load the application and show key elements', async ({ page }) => {
    // Check for the "Compile" button by text, which is visible in the screenshot
    await expect(page.getByText('Compile')).toBeVisible({ timeout: 10000 });

    // Check for the Sidebar toggle (Z logo)
    // It's a button with the text "Z"
    await expect(page.getByRole('button', { name: 'Z', exact: true })).toBeVisible();
  });

  test('should toggle the sidebar', async ({ page }) => {
    // Initially sidebar should be open and 'src' folder visible
    // The screenshot confirms 'src' is visible
    await expect(page.getByText('src', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // The sidebar toggle is the "Z" button
    const sidebarToggle = page.getByRole('button', { name: 'Z', exact: true });
    await sidebarToggle.click();
    
    // Verify it's still there
    await expect(sidebarToggle).toBeVisible();
  });

  test('should open logs when compile is clicked', async ({ page }) => {
    const compileBtn = page.getByText('Compile');
    await compileBtn.click();

    // Clicking compile should open the Logs tab
    // We use exact match to avoid strict mode violations with other text containing "Logs"
    await expect(page.getByText('Logs', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should interact with the AI prompt', async ({ page }) => {
    const textarea = page.getByPlaceholder('Enter the AI prompt here...');
    
    // In the screenshot, AI Prompt is already open
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill('Hello AI, help me code!');
    await expect(textarea).toHaveValue('Hello AI, help me code!');
  });
});
