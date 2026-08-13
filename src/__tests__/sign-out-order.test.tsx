import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ordering, not behaviour: signoutRedirect() reads the stored user for
// id_token_hint and removes it itself, so anything that clears first sends Dex a
// post_logout_redirect_uri with no hint -- which it answers 400 -- and drops
// isAuthenticated while the session is still live, so the app signs straight back
// in and the click looks like a page reload.

const signoutRedirect = vi.fn();
const removeUser = vi.fn();
const getMetadata = vi.fn();
const calls: string[] = [];
const replaceNav = vi.fn();

vi.mock('react-oidc-context', () => ({
  useAuth: () => ({
    signoutRedirect: () => {
      calls.push('signoutRedirect');
      return signoutRedirect();
    },
    removeUser: () => {
      calls.push('removeUser');
      return removeUser();
    },
  }),
}));

vi.mock('@/auth/user-manager', () => ({
  userManager: { metadataService: { getMetadata } },
}));

vi.mock('@/config', () => ({
  oidcConfig: { enabled: true, authority: 'https://auth.agyn.dev:2496', clientId: 'agyn-console', scope: 'openid', resource: null },
}));

vi.mock('@/api/client', () => ({
  usersClient: { getCurrentUser: vi.fn().mockResolvedValue({ user: null, clusterRole: null }) },
}));

const { UserProvider, useUserContext } = await import('@/context/UserContext');

function SignOutOnMount() {
  const { signOut } = useUserContext();
  return (
    <button type="button" data-testid="go" onClick={() => signOut()}>
      out
    </button>
  );
}

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UserProvider>
        <SignOutOnMount />
      </UserProvider>
    </QueryClientProvider>,
  );
}

const USER_KEY = 'oidc.user:https://auth.agyn.dev:2496:agyn-console';

describe('signOut ordering', () => {
  beforeEach(() => {
    calls.length = 0;
    signoutRedirect.mockReset().mockResolvedValue(undefined);
    removeUser.mockReset().mockResolvedValue(undefined);
    getMetadata.mockReset();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(USER_KEY, '{"id_token":"tok"}');
    // The local path navigates to force a fresh mount, which jsdom cannot do and
    // will not let be spied on -- location has to be swapped wholesale.
    replaceNav.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://console.agyn.dev:2496', replace: replaceNav },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('redirects before anything clears the stored user', async () => {
    getMetadata.mockResolvedValue({ end_session_endpoint: 'https://auth.agyn.dev:2496/logout' });

    const { getByTestId } = renderIt();
    getByTestId('go').click();

    await waitFor(() => expect(calls).toContain('signoutRedirect'));

    expect(calls[0]).toBe('signoutRedirect');
    expect(calls).not.toContain('removeUser');
    // The id_token has to still be there for signoutRedirect() to lift it.
    expect(window.sessionStorage.getItem(USER_KEY)).not.toBeNull();
  });

  it('signs out locally when the provider holds no session', async () => {
    getMetadata.mockResolvedValue({ issuer: 'https://auth.agyn.dev:2496' });

    const { getByTestId } = renderIt();
    getByTestId('go').click();

    await waitFor(() => expect(calls).toContain('removeUser'));

    expect(calls).not.toContain('signoutRedirect');
    expect(window.sessionStorage.getItem(USER_KEY)).toBeNull();
    expect(replaceNav).toHaveBeenCalledWith('https://console.agyn.dev:2496');
  });
});
