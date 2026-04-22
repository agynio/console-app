import { argosScreenshot } from '@argos-ci/playwright';
import { expect, test } from './fixtures';
import { createApp, createOrganization, installApp, setSelectedOrganization } from './console-api';

test('shows installation detail page', async ({ page }) => {
  const now = Date.now();
  const organizationId = await createOrganization(page, `e2e-org-apps-${now}`);
  await setSelectedOrganization(page, organizationId);

  const appId = await createApp(page, {
    organizationId,
    slug: `e2e-app-${now}`,
    name: `E2E App ${now}`,
    description: 'E2E app for installation detail snapshot',
  });

  const installationSlug = `e2e-installation-${now}`;
  const installationId = await installApp(page, {
    appId,
    organizationId,
    slug: installationSlug,
    configuration: { region: 'us-east-1' },
  });

  await page.goto(`/organizations/${organizationId}/apps/installations/${installationId}`);
  await expect(page.getByTestId('installation-detail-card')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('installation-detail-slug')).toHaveText(installationSlug, { timeout: 15000 });
  await argosScreenshot(page, 'installation-detail');
});
