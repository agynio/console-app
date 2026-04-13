import { test, expect } from './fixtures';
import { createOrganization, setSelectedOrganization } from './console-api';

test('shows usage dashboard', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-usage-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);

  await page.goto(`/organizations/${organizationId}/usage`);

  const emptyState = page.getByTestId('organization-usage-empty');
  const llmSection = page.getByTestId('organization-usage-llm-section');

  await expect(llmSection.or(emptyState)).toBeVisible({ timeout: 15000 });
  if (await emptyState.isVisible()) {
    await expect(emptyState).toBeVisible();
    return;
  }

  await expect(page.getByTestId('organization-usage-llm-input')).toContainText(/\d|\u2014/, { timeout: 15000 });
  await expect(page.getByTestId('organization-usage-llm-daily-chart')).toBeVisible();

  await expect(page.getByTestId('organization-usage-compute-section')).toBeVisible();
  await expect(page.getByTestId('organization-usage-storage-section')).toBeVisible();
  await expect(page.getByTestId('organization-usage-platform-section')).toBeVisible();
});
