import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime config', () => {
  beforeEach(() => {
    window.__ENV__ = {};
    vi.resetModules();
  });

  it('defaults the API base URL to /api', async () => {
    const { config, oidcConfig } = await import('@/config');
    expect(config.apiBaseUrl).toBe('/api');
    expect(oidcConfig.enabled).toBe(false);
  });

  it('reads runtime config values when provided', async () => {
    window.__ENV__ = {
      API_BASE_URL: 'https://api.example.com/',
      OIDC_AUTHORITY: 'https://auth.example.com',
      OIDC_CLIENT_ID: 'console-client',
      OIDC_SCOPE: 'openid profile',
    };
    const { config, oidcConfig } = await import('@/config');
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(oidcConfig).toEqual({
      enabled: true,
      authority: 'https://auth.example.com',
      clientId: 'console-client',
      scope: 'openid profile',
    });
  });

  it('throws when OIDC values are missing', async () => {
    window.__ENV__ = {
      OIDC_AUTHORITY: 'https://auth.example.com',
    };
    await expect(import('@/config')).rejects.toThrow('OIDC_CLIENT_ID');
  });
});
