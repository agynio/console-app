import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { oidcConfig } from '@/config';

export const userManager = oidcConfig.enabled
  ? new UserManager({
      authority: oidcConfig.authority,
      client_id: oidcConfig.clientId,
      redirect_uri: `${window.location.origin}/callback`,
      post_logout_redirect_uri: window.location.origin,
      // Renewal runs through a hidden frame against the provider's own session
      // rather than a refresh token, so the app holds nothing long-lived. Dex
      // compares redirect URIs whole, so this is registered alongside the
      // callback rather than covered by it.
      silent_redirect_uri: `${window.location.origin}/silent-renew`,
      scope: oidcConfig.scope,
      // `resource` alone only reaches the authorize redirect and refresh
      // requests — oidc-client-ts omits it from the initial code->token
      // exchange. Logto mints a JWT access token only when the token request
      // carries the resource; without it the token is opaque and the gateway
      // rejects it. Force it into the token exchange via extraTokenParams.
      resource: oidcConfig.resource ?? undefined,
      extraTokenParams: oidcConfig.resource
        ? { resource: oidcConfig.resource }
        : {},
      response_type: 'code',
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
    })
  : null;

export async function getAccessToken(): Promise<string | null> {
  if (!userManager) return null;
  const user = await userManager.getUser();
  return user?.access_token ?? null;
}
