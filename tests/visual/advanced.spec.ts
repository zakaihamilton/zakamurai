import { test, expect } from '@playwright/test';

test.describe('Zakamurai Advanced Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:3000/');
    await expect(page.getByText('Initializing workspace...')).not.toBeVisible({ timeout: 60000 });
  });

  test('should toggle theme', async ({ page }) => {
    const body = page.locator('body');
    const themeToggle = page.locator('header button').last();
    const initialClass = await body.evaluate(el => el.className);
    await themeToggle.click();
    const newClass = await body.evaluate(el => el.className);
    expect(newClass).not.toBe(initialClass);
  });

  test('should open keyboard shortcuts dialog', async ({ page }) => {
    await page.locator('header button').nth(-2).click();
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
    
    // Go back to welcome screen via breadcrumb
    // The breadcrumb segment for 'Zakamurai' should bring us back to the root
    await page.locator('header').getByText('Zakamur', { exact: false }).first().click();
    
    // Verify we are back on the welcome screen by checking for the 'Project info' button
    await expect(page.getByText('Project info')).toBeVisible({ timeout: 10000 });
  });

  test('should show new project confirmation dialog', async ({ page }) => {
    await page.locator('header button').nth(-2).click();
    await page.getByText('New Project', { exact: true }).click();
    await expect(page.getByText('Are you sure you want to start a new project?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Are you sure you want to start a new project?')).not.toBeVisible();
  });
});
