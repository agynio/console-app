import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMetadata = vi.fn();

vi.mock('./user-manager', () => ({
  userManager: { metadataService: { getMetadata } },
}));

const { signOutAtProvider } = await import('./sign-out');

describe('signOutAtProvider', () => {
  beforeEach(() => {
    getMetadata.mockReset();
  });

  // Reports the redirect so the caller can tell a sign-out that navigated from
  // one that still owes a local clear. Clearing on both paths is the bug this
  // guards: signoutRedirect() needs the stored id_token for id_token_hint.
  it('redirects and reports it when the provider publishes an end session endpoint', async () => {
    getMetadata.mockResolvedValue({ end_session_endpoint: 'https://auth.agyn.dev:2496/logout' });
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await expect(signOutAtProvider(signoutRedirect)).resolves.toBe(true);

    expect(signoutRedirect).toHaveBeenCalledOnce();
  });

  // A provider that holds no browser session has nothing to end, so the caller's
  // local sign-out is the whole sign-out. Redirecting anyway throws, and the app
  // renders that as a sign-in failure.
  it('does nothing when the provider publishes no end session endpoint', async () => {
    getMetadata.mockResolvedValue({ issuer: 'https://dex.agyn.dev:2496' });
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await expect(signOutAtProvider(signoutRedirect)).resolves.toBe(false);

    expect(signoutRedirect).not.toHaveBeenCalled();
  });

  it('does nothing when discovery cannot be read', async () => {
    getMetadata.mockRejectedValue(new Error('network down'));
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await expect(signOutAtProvider(signoutRedirect)).resolves.toBe(false);

    expect(signoutRedirect).not.toHaveBeenCalled();
  });
});
