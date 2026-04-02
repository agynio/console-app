type RuntimeEnv = {
  API_BASE_URL?: string;
  OIDC_AUTHORITY?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_SCOPE?: string;
};

type OidcConfigEnabled = {
  enabled: true;
  authority: string;
  clientId: string;
  redirectUri: string;
  scope: string;
};

type OidcConfigDisabled = {
  enabled: false;
};

export type OidcConfig = OidcConfigEnabled | OidcConfigDisabled;

const runtimeEnv: RuntimeEnv = typeof window !== 'undefined' ? (window.__ENV__ ?? {}) : {};

function readRuntime(key: keyof RuntimeEnv): string | null {
  const value = runtimeEnv[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireConfig(name: string, value: string | null): string {
  if (value) return value;
  throw new Error(`console-app config: required ${name} is missing`);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const rawApiBase = readRuntime('API_BASE_URL');
const apiBaseUrl = stripTrailingSlash(rawApiBase ?? '/api');

const authority = readRuntime('OIDC_AUTHORITY');
const clientId = readRuntime('OIDC_CLIENT_ID');
const redirectUri = readRuntime('OIDC_REDIRECT_URI');
const scope = readRuntime('OIDC_SCOPE');
const oidcConfigured = Boolean(authority || clientId || redirectUri || scope);

export const oidcConfig: OidcConfig = oidcConfigured
  ? {
      enabled: true,
      authority: requireConfig('OIDC_AUTHORITY', authority),
      clientId: requireConfig('OIDC_CLIENT_ID', clientId),
      redirectUri: requireConfig('OIDC_REDIRECT_URI', redirectUri),
      scope: requireConfig('OIDC_SCOPE', scope),
    }
  : { enabled: false };

export const config = {
  apiBaseUrl,
};
