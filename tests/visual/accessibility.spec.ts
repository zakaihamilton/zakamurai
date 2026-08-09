import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('workspace shell and keyboard shortcut dialog have no critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

  const shellResults = await new AxeBuilder({ page }).analyze();
  expect(shellResults.violations.filter(({ impact }) => impact === 'critical')).toEqual([]);

  await page.keyboard.press('Control+Shift+K');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const dialogResults = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(dialogResults.violations.filter(({ impact }) => impact === 'critical')).toEqual([]);
});
