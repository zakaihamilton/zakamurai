import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('workspace shell and keyboard shortcut dialog have no critical or serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

  const shellResults = await new AxeBuilder({ page }).analyze();
  const blocking = ({ impact }: { impact?: string | null }) =>
    impact === 'critical' || impact === 'serious';
  expect(shellResults.violations.filter(blocking)).toEqual([]);

  await page.keyboard.press('Control+Shift+K');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('opacity', '1');
  const dialogResults = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(dialogResults.violations.filter(blocking)).toEqual([]);
});
