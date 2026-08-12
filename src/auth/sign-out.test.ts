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

  it('redirects when the provider publishes an end session endpoint', async () => {
    getMetadata.mockResolvedValue({ end_session_endpoint: 'https://auth.agyn.dev:2496/logout' });
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await signOutAtProvider(signoutRedirect);

    expect(signoutRedirect).toHaveBeenCalledOnce();
  });

  // Dex publishes none and holds no browser session, so the local sign-out the
  // caller already did is the whole sign-out. Redirecting anyway throws, and the
  // app renders that as a sign-in failure.
  it('does nothing when the provider publishes no end session endpoint', async () => {
    getMetadata.mockResolvedValue({ issuer: 'https://dex.agyn.dev:2496' });
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await signOutAtProvider(signoutRedirect);

    expect(signoutRedirect).not.toHaveBeenCalled();
  });

  it('does nothing when discovery cannot be read', async () => {
    getMetadata.mockRejectedValue(new Error('network down'));
    const signoutRedirect = vi.fn().mockResolvedValue(undefined);

    await signOutAtProvider(signoutRedirect);

    expect(signoutRedirect).not.toHaveBeenCalled();
  });
});
