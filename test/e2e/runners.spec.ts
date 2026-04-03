import { argosScreenshot } from '@argos-ci/playwright';
import { test, expect } from './fixtures';
import { listRunners } from './console-api';

test('lists cluster runners', async ({ page }) => {
  await page.goto('/runners');
  await expect(page.getByTestId('runners-table')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('runners-row').first()).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'runners-list');
});

test('runner detail shows metadata', async ({ page }) => {
  const runners = await listRunners(page);
  const runnerId = runners[0]?.meta?.id;
  if (!runnerId) {
    test.skip(true, 'No runners available for detail view.');
    return;
  }

  await page.goto(`/runners/${runnerId}`);
  await expect(page.getByTestId('runner-details-card')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'runner-detail');
});
