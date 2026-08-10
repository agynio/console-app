import { describe, expect, it } from 'vitest';
import { PrivateResourceAccessPrincipalType } from '@/gen/agynio/api/networks/v1/networks_pb';
import { formatPrincipalType } from '@/lib/networks';

describe('formatPrincipalType', () => {
  it('names every principal a grant can carry', () => {
    const named = Object.values(PrivateResourceAccessPrincipalType)
      .filter((value): value is PrivateResourceAccessPrincipalType => typeof value === 'number')
      .filter((value) => value !== PrivateResourceAccessPrincipalType.UNSPECIFIED);

    // A principal the map does not know renders as "Unspecified", which is how
    // an environment grant showed up before this — a real grant, labelled as
    // though it were broken.
    for (const type of named) {
      expect(formatPrincipalType(type)).not.toBe('Unspecified');
    }
  });

  it('names the environment principal', () => {
    expect(formatPrincipalType(PrivateResourceAccessPrincipalType.ENVIRONMENT)).toBe('Environment');
  });
});
