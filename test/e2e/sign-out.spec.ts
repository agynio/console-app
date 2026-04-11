import { test, expect } from './fixtures';
import { readOidcSession } from './oidc-helpers';

test('signs out from user menu', async ({ page }) => {
  const session = await readOidcSession(page);
  expect(session?.accessToken).toBeTruthy();

  await expect(page.getByTestId('user-menu-trigger')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('user-menu-signout').click({ noWaitAfter: true });

  await page.waitForFunction(() => {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith('oidc.user:')) return false;
    }
    return true;
  }, { timeout: 20000 });
});

test('signs out from settings page', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-profile-card')).toBeVisible({ timeout: 15000 });

  const session = await readOidcSession(page);
  expect(session?.accessToken).toBeTruthy();

  await page.getByTestId('settings-signout').click({ noWaitAfter: true });
  await page.waitForFunction(() => {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith('oidc.user:')) return false;
    }
    return true;
  }, { timeout: 20000 });
});
