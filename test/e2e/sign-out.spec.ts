import { test, expect } from './fixtures';
import { readOidcSession } from './oidc-helpers';

async function waitForSessionClear(page: Parameters<typeof readOidcSession>[0]) {
  await expect.poll(async () => {
    try {
      return await readOidcSession(page);
    } catch {
      return 'pending';
    }
  }).toBeNull();
}

test('signs out from user menu', async ({ page }) => {
  const session = await readOidcSession(page);
  expect(session?.accessToken).toBeTruthy();

  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('user-menu-signout').click({ noWaitAfter: true });

  await waitForSessionClear(page);
});

test('signs out from settings page', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-profile-card')).toBeVisible({ timeout: 15000 });

  const session = await readOidcSession(page);
  expect(session?.accessToken).toBeTruthy();

  await page.getByTestId('settings-signout').click({ noWaitAfter: true });
  await waitForSessionClear(page);
});
