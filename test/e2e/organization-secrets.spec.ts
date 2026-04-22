import { argosScreenshot } from '@argos-ci/playwright';
import { test, expect } from './fixtures';
import {
  clearOrganizationSecrets,
  createLocalSecret,
  createOrganization,
  createSecret,
  createSecretProvider,
  setSelectedOrganization,
} from './console-api';

test('shows empty secrets tab initially', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-secrets-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);
  await clearOrganizationSecrets(page, organizationId);

  await page.goto(`/organizations/${organizationId}/secret-providers`);
  await expect(page.getByTestId('secret-providers-empty')).toBeVisible({ timeout: 15000 });
  await page.goto(`/organizations/${organizationId}/secrets`);
  await expect(page.getByTestId('secrets-empty')).toBeVisible({ timeout: 15000 });
});

test('shows secret providers and secrets', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-secrets-list-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);
  const providerName = `e2e-provider-${Date.now()}`;
  const secretName = `e2e-secret-${Date.now()}`;

  const providerId = await createSecretProvider(page, {
    organizationId,
    name: providerName,
    url: 'https://vault.example.com',
  });
  await createSecret(page, {
    providerId,
    name: secretName,
    value: `e2e-value-${Date.now()}`,
    organizationId,
  });

  await page.goto(`/organizations/${organizationId}/secret-providers`);
  await expect(page.getByTestId('secret-provider-row').filter({ hasText: providerName })).toBeVisible({ timeout: 15000 });
  await page.goto(`/organizations/${organizationId}/secrets`);
  await expect(page.getByTestId('secret-row').filter({ hasText: secretName })).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'organization-secrets-list');
});

test('shows local secrets without plaintext', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-secrets-local-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);
  await clearOrganizationSecrets(page, organizationId);

  const secretName = `e2e-local-secret-${Date.now()}`;
  const secretValue = `e2e-local-value-${Date.now()}`;
  await createLocalSecret(page, { name: secretName, value: secretValue, organizationId });

  await page.goto(`/organizations/${organizationId}/secrets`);
  const row = page.getByTestId('secret-row').filter({ hasText: secretName });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByTestId('secret-source')).toHaveText('Built-in');
  await expect(row.getByTestId('secret-reference')).toHaveText('Stored in console');
  await expect(row).not.toContainText(secretValue);
  await argosScreenshot(page, 'organization-secrets-local-list');

  await row.getByTestId('secret-edit').click();
  const editDialog = page.getByTestId('secrets-edit-dialog');
  await expect(editDialog).toBeVisible({ timeout: 15000 });
  await expect(editDialog.getByTestId('secrets-edit-value')).toHaveValue('');
  await argosScreenshot(page, 'organization-secrets-local-edit', { fullPage: false });
});

test('shows secret create dialog storage modes', async ({ page }) => {
  const organizationId = await createOrganization(page, `e2e-org-secrets-create-${Date.now()}`);
  await setSelectedOrganization(page, organizationId);
  await clearOrganizationSecrets(page, organizationId);

  await page.goto(`/organizations/${organizationId}/secrets`);
  await page.getByTestId('organization-secrets-create').click();
  const createDialog = page.getByTestId('secrets-create-dialog');
  await expect(createDialog).toBeVisible({ timeout: 15000 });
  await expect(createDialog.getByTestId('secrets-create-provider')).toBeVisible({ timeout: 15000 });
  await expect(createDialog.getByTestId('secrets-create-remote')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'organization-secrets-create-remote', { fullPage: false });

  await createDialog.getByTestId('secrets-create-storage-mode').click();
  await page.getByRole('option', { name: 'Local (built-in)' }).click();
  await expect(createDialog.getByTestId('secrets-create-value')).toBeVisible({ timeout: 15000 });
  await expect(createDialog.getByTestId('secrets-create-value')).toHaveValue('');
  await argosScreenshot(page, 'organization-secrets-create-local', { fullPage: false });
});
