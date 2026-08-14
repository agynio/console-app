import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NEW_SECRET, NO_SECRET, resolveSecretChoice, secretChoiceOf } from '@/lib/secret-choice';

const { createSecret } = vi.hoisted(() => ({ createSecret: vi.fn() }));

vi.mock('@/api/client', () => ({ secretsClient: { createSecret } }));

describe('secret choice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSecret.mockResolvedValue({ secret: { meta: { id: 'sec-new' } } });
  });

  it('reads an existing reference back as the selection', () => {
    expect(secretChoiceOf('sec-1').selection).toBe('sec-1');
    expect(secretChoiceOf('').selection).toBe(NO_SECRET);
  });

  it('resolves nothing to an empty id', async () => {
    const id = await resolveSecretChoice({
      organizationId: 'org-1',
      choice: secretChoiceOf(''),
      fallbackTitle: 'fallback',
      description: 'unused',
    });
    expect(id).toBe('');
    expect(createSecret).not.toHaveBeenCalled();
  });

  it('passes an existing reference through untouched', async () => {
    const id = await resolveSecretChoice({
      organizationId: 'org-1',
      choice: secretChoiceOf('sec-1'),
      fallbackTitle: 'fallback',
      description: 'unused',
    });
    expect(id).toBe('sec-1');
    expect(createSecret).not.toHaveBeenCalled();
  });

  // The value reaches the Secrets service and nowhere else: what the resource
  // is given is the id.
  it('creates a secret first and returns its id', async () => {
    const id = await resolveSecretChoice({
      organizationId: 'org-1',
      choice: { selection: NEW_SECRET, title: '  ', value: 'hunter2' },
      fallbackTitle: 'registry password',
      description: 'Registry password',
    });
    expect(id).toBe('sec-new');
    expect(createSecret).toHaveBeenCalledWith({
      organizationId: 'org-1',
      title: 'registry password',
      description: 'Registry password',
      value: 'hunter2',
    });
  });
});
