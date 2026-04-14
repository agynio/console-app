import { argosScreenshot } from '@argos-ci/playwright';
import { test, expect } from './fixtures';
import { createLLMProvider, createModel, createOrganization, setSelectedOrganization } from './console-api';

const TEST_LLM_ENDPOINT = 'https://testllm.dev/v1/org/agynio/suite/agn/responses';
const QUERY_USAGE_ROUTE = '**/api/agynio.api.gateway.v1.MeteringGateway/QueryUsage';
const CONNECT_HEADERS = {
  'Content-Type': 'application/json',
  'Connect-Protocol-Version': '1',
};

type UsageQueryRequest = {
  groupBy?: string;
  group_by?: string;
  granularity?: string | number;
  labelFilters?: Record<string, string>;
  label_filters?: Record<string, string>;
};

type UsageBucketWire = {
  timestamp?: string;
  groupValue: string;
  value: string;
};

function isDailyGranularity(granularity?: string | number): boolean {
  return granularity === 'GRANULARITY_DAY' || granularity === 2;
}

function buildUsageBuckets(requestBody: UsageQueryRequest | null): UsageBucketWire[] {
  const groupBy = requestBody?.groupBy ?? requestBody?.group_by ?? '';
  const labelFilters = requestBody?.labelFilters ?? requestBody?.label_filters ?? {};
  const isDaily = isDailyGranularity(requestBody?.granularity);
  const timestamp = new Date().toISOString();
  const baseValue = 3_000_000;

  const buildBuckets = (groups: string[]): UsageBucketWire[] =>
    groups.map((groupValue, index) => ({
      ...(isDaily ? { timestamp } : {}),
      groupValue,
      value: String(baseValue * (index + 1)),
    }));

  if (groupBy === 'kind') {
    return buildBuckets(['input', 'cached', 'output']);
  }
  if (groupBy === 'status') {
    return buildBuckets(['success', 'failed']);
  }
  if (groupBy === 'identity_id') {
    return buildBuckets(['identity-1']);
  }
  if (groupBy === 'resource_id') {
    return buildBuckets(['model-1']);
  }
  if (labelFilters.kind) {
    return buildBuckets(['']);
  }
  return buildBuckets(['']);
}

test('shows populated usage dashboard after LLM call', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-usage-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);

  await page.route(QUERY_USAGE_ROUTE, async (route) => {
    let requestBody: UsageQueryRequest | null = null;
    try {
      requestBody = route.request().postDataJSON() as UsageQueryRequest;
    } catch {
      requestBody = null;
    }
    const buckets = buildUsageBuckets(requestBody);
    await route.fulfill({
      status: 200,
      headers: CONNECT_HEADERS,
      body: JSON.stringify({ buckets }),
    });
  });

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

  await page.route(QUERY_USAGE_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      headers: CONNECT_HEADERS,
      body: JSON.stringify({ buckets: [] }),
    });
  });

  await page.goto(`/organizations/${organizationId}/usage`);

  await expect(page.getByTestId('organization-usage-empty')).toBeVisible();
  await expect(page.getByTestId('organization-usage-llm-section')).toHaveCount(0);

  await argosScreenshot(page, 'organization-usage-empty');
});
