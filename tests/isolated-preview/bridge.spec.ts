import { expect, test } from '@playwright/test';

test('isolates preview-origin code from parent storage access', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:3001/isolated-preview-test.html';
    iframe.title = 'isolated-preview-test';
    document.body.append(iframe);
  });

  const preview = page.frameLocator('iframe[title="isolated-preview-test"]');
  await expect(preview.locator('body')).toHaveText('parent-access-blocked');
});

test('keeps preview-origin storage separate from the IDE origin', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:3001/isolated-preview-test.html';
    iframe.title = 'isolated-preview-storage-test';
    document.body.append(iframe);
  });

  const preview = page.frameLocator('iframe[title="isolated-preview-storage-test"]');
  await expect(preview.locator('body')).toHaveText('parent-access-blocked');
  await preview.locator('body').evaluate(() => localStorage.setItem('preview-only-key', 'value'));

  await expect.poll(() => page.evaluate(() => localStorage.getItem('preview-only-key'))).toBeNull();
});
