import { describe, expect, it } from 'vitest';
import { config, oidcConfig } from '@/config';

describe('runtime config', () => {
  it('defaults the API base URL to /api', () => {
    expect(config.apiBaseUrl).toBe('/api');
  });

  it('disables OIDC when runtime values are missing', () => {
    expect(oidcConfig.enabled).toBe(false);
  });
});
