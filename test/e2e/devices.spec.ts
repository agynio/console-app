import { argosScreenshot } from '@argos-ci/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { createDevice, deleteDevice, listDevices } from './console-api';

const DEVICE_NAME_PREFIX = 'e2e-device';

const buildDeviceName = (suffix: string) => `${DEVICE_NAME_PREFIX}-${suffix}-${Date.now()}`;

async function cleanupDevices(page: Page): Promise<void> {
  const devices = await listDevices(page);
  const deviceIds = devices
    .filter((device) => device.name?.startsWith(DEVICE_NAME_PREFIX))
    .map((device) => device.meta?.id)
    .filter((deviceId): deviceId is string => Boolean(deviceId));
  await Promise.all(deviceIds.map((deviceId) => deleteDevice(page, deviceId)));
}

test.beforeEach(async ({ page }) => {
  await cleanupDevices(page);
});

test.afterEach(async ({ page }) => {
  await cleanupDevices(page);
});

test('shows empty devices page', async ({ page }) => {
  await page.goto('/devices');
  await expect(page.getByTestId('list-search')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('devices-empty')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'devices-empty');
});

test('creates a device and shows enrollment JWT', async ({ page }) => {
  const deviceName = buildDeviceName('jwt');

  await page.goto('/devices');
  await expect(page.getByTestId('list-search')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('devices-create').click();
  await expect(page.getByTestId('devices-create-dialog')).toBeVisible({ timeout: 15000 });

  const createDialog = page.getByTestId('devices-create-dialog');
  await createDialog.getByTestId('devices-name').fill(deviceName);
  await page.getByTestId('devices-submit').click();

  await expect(page.getByTestId('devices-jwt-value')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'devices-create-jwt');

  await page.getByTestId('devices-jwt-done').click();

  const deviceRow = page.getByTestId('devices-row').filter({ hasText: deviceName });
  await expect(deviceRow).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'devices-list');
});

test('deletes a device with confirmation', async ({ page }) => {
  const deviceName = buildDeviceName('delete');
  const created = await createDevice(page, { name: deviceName });
  const deviceId = created.device?.meta?.id;
  if (!deviceId) {
    throw new Error('CreateDevice response missing device id for delete test.');
  }

  await page.goto('/devices');
  await expect(page.getByTestId('list-search')).toBeVisible({ timeout: 15000 });

  const deviceRow = page.getByTestId('devices-row').filter({ hasText: deviceName });
  await expect(deviceRow).toBeVisible({ timeout: 15000 });

  await deviceRow.getByTestId('devices-delete').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible({ timeout: 15000 });
  await argosScreenshot(page, 'devices-delete-confirm');

  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(deviceRow).toHaveCount(0, { timeout: 15000 });
});
