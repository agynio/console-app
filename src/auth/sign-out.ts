import { userManager } from './user-manager';

// Keycloak publishes end_session_endpoint and keeps a browser session that only
// the redirect can end. Dex publishes neither, and signoutRedirect() throws on
// the missing endpoint -- react-oidc-context catches that into auth.error, so a
// sign-out that already succeeded renders the sign-in failure screen instead of
// the signed-out one.
//
// Discovery being unreachable counts as absent: the local sign-out has already
// happened by the time this is asked, and there is nothing to gain from failing.
async function supportsProviderSignOut(): Promise<boolean> {
  if (!userManager) return false;
  try {
    const metadata = await userManager.metadataService.getMetadata();
    return Boolean(metadata.end_session_endpoint);
  } catch (error) {
    console.warn('Could not read OIDC discovery; signing out locally.', error);
    return false;
  }
}

/**
 * Ends the session at the provider, for providers that hold one. The caller has
 * already signed out locally, so this is a no-op wherever there is nothing to
 * end.
 */
export async function signOutAtProvider(signoutRedirect: () => Promise<void>): Promise<void> {
  if (!(await supportsProviderSignOut())) return;
  await signoutRedirect();
}
