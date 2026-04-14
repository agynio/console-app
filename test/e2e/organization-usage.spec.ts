import { argosScreenshot } from '@argos-ci/playwright';
import { test, expect } from './fixtures';
import { createLLMProvider, createModel, createOrganization, setSelectedOrganization } from './console-api';

const TEST_LLM_ENDPOINT = 'https://testllm.dev/v1/org/agynio/suite/agn/responses';

test('shows populated usage dashboard after LLM call', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-usage-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);

  const providerId = await createLLMProvider(page, {
    organizationId,
    endpoint: TEST_LLM_ENDPOINT,
    authMethod: 'AUTH_METHOD_X_API_KEY',
    token: 'e2e-test-token',
    protocol: 'PROTOCOL_RESPONSES',
  });

  const modelName = `e2e-model-usage-${Date.now()}`;
  await createModel(page, {
    organizationId,
    providerId,
    name: modelName,
    remoteName: 'summarize-history',
  });

  await page.goto(`/organizations/${organizationId}/models`);
  const row = page.getByTestId('organization-model-row').filter({ hasText: modelName });
  await expect(row).toBeVisible({ timeout: 15000 });

  await row.getByTestId('organization-model-test').click();
  await expect(page.getByTestId('organization-model-test-pending')).toBeVisible();
  await expect(page.getByTestId('organization-model-test-success')).toBeVisible({ timeout: 15000 });

  await expect(async () => {
    await page.goto(`/organizations/${organizationId}/usage`);
    await expect(page.getByTestId('organization-usage-llm-section')).toBeVisible();
  }).toPass({ timeout: 30000 });

  await expect(page.getByTestId('organization-usage-llm-section')).toBeVisible();
  await expect(page.getByTestId('organization-usage-llm-input')).toContainText(/\d/, { timeout: 15000 });
  await expect(page.getByTestId('organization-usage-llm-daily-chart')).toBeVisible();
  await expect(page.getByTestId('organization-usage-compute-section')).toBeVisible();
  await expect(page.getByTestId('organization-usage-storage-section')).toBeVisible();
  await expect(page.getByTestId('organization-usage-platform-section')).toBeVisible();

  await argosScreenshot(page, 'organization-usage-dashboard');
});

test('shows empty state for range with no data', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-usage-empty-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);

  const usageLoaded = page.waitForResponse(
    (resp) => resp.url().includes('MeteringGateway/QueryUsage') && resp.status() === 200,
    { timeout: 15000 },
  );

  await page.goto(`/organizations/${organizationId}/usage`);
  await usageLoaded;

  await expect(page.getByTestId('organization-usage-empty')).toBeVisible();
  await expect(page.getByTestId('organization-usage-llm-section')).toHaveCount(0);

  await argosScreenshot(page, 'organization-usage-empty');
});
