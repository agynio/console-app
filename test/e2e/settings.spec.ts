import { argosScreenshot } from '@argos-ci/playwright';
import { test, expect } from './fixtures';

test('shows settings profile info', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-profile-card')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'settings-profile');
});
