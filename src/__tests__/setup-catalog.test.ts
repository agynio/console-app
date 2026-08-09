import { create } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import {
  EntityMetaSchema,
  ImageSchema,
  ImageVersionSchema,
} from '@/gen/agynio/api/images/v1/images_pb';
import {
  availableName,
  newestTag,
  nicknameFrom,
  presetsFor,
  resolveImage,
  resolveRunner,
} from '@/pages/setup/catalog';
import {
  EntityMetaSchema as RunnerEntityMetaSchema,
  RunnerSchema,
} from '@/gen/agynio/api/runners/v1/runners_pb';

const version = (tag: string, pushedSeconds?: number) =>
  create(ImageVersionSchema, {
    tag,
    pushedAt: pushedSeconds ? { seconds: BigInt(pushedSeconds), nanos: 0 } : undefined,
  });

describe('newestTag', () => {
  it('pins the newest semver when the repository publishes one', () => {
    expect(newestTag([version('1.1.0'), version('1.2.0'), version('latest')])).toBe('1.2.0');
  });

  it('falls back to latest rather than a build tag', () => {
    const tags = [
      version('tmp-39f445799b5c0af59844a080edb820829236441e-amd64', 200),
      version('latest', 100),
      version('sha-abc1234', 150),
    ];
    expect(newestTag(tags)).toBe('latest');
  });

  it('takes the most recently pushed when there is no semver and no latest', () => {
    expect(newestTag([version('sha-old', 100), version('sha-new', 200)])).toBe('sha-new');
  });

  it('is empty when the repository has no versions at all', () => {
    expect(newestTag([])).toBe('');
  });
});

describe('resolveImage', () => {
  const image = (id: string, name: string, organizationId: string) =>
    create(ImageSchema, { meta: create(EntityMetaSchema, { id }), name, organizationId });

  it("prefers the organization's own image over the shared one", () => {
    const images = [image('shared', 'claude', 'platform'), image('own', 'claude', 'org-1')];
    expect(resolveImage(images, 'claude', 'org-1')?.meta?.id).toBe('own');
  });

  it('falls back to the shared image', () => {
    expect(resolveImage([image('shared', 'claude', 'platform')], 'claude', 'org-1')?.meta?.id).toBe(
      'shared',
    );
  });
});

describe('resolveRunner', () => {
  const runner = (id: string, name: string, organizationId?: string) =>
    create(RunnerSchema, {
      meta: create(RunnerEntityMetaSchema, { id }),
      name,
      organizationId,
    });

  it("prefers the organization's own runner", () => {
    const runners = [runner('shared', 'a-shared'), runner('own', 'z-own', 'org-1')];
    expect(resolveRunner(runners, 'org-1')?.meta?.id).toBe('own');
  });

  it('resolves ties by name so a re-run picks the same one', () => {
    const runners = [runner('b', 'beta'), runner('a', 'alpha')];
    expect(resolveRunner(runners, 'org-1')?.meta?.id).toBe('a');
  });
});

describe('availableName', () => {
  it('suffixes rather than colliding with what a previous run left', () => {
    expect(availableName(['default'], 'default')).toBe('default-2');
    expect(availableName(['default', 'default-2'], 'default')).toBe('default-3');
    expect(availableName([], 'default')).toBe('default');
  });
});

describe('presetsFor', () => {
  it('offers only vendors that can serve the chosen CLI', () => {
    expect(presetsFor('claude').map((preset) => preset.id)).toEqual(['anthropic', 'custom']);
    expect(presetsFor('codex').map((preset) => preset.id)).toEqual(['openai', 'microsoft', 'custom']);
  });
});

describe('nicknameFrom', () => {
  it('lowercases and replaces anything the handle cannot hold', () => {
    expect(nicknameFrom('Code Reviewer', [])).toBe('code-reviewer');
    expect(nicknameFrom("Ann's Bot!", [])).toBe('ann-s-bot');
  });

  it('falls back when a name survives none of the rules', () => {
    expect(nicknameFrom('!!!', [])).toBe('agent');
  });

  it('suffixes rather than colliding with a handle in use', () => {
    expect(nicknameFrom('Assistant', ['assistant'])).toBe('assistant-2');
    expect(nicknameFrom('Assistant', ['assistant', 'assistant-2'])).toBe('assistant-3');
  });

  it('stays within the 32 character limit, suffix included', () => {
    const long = 'a'.repeat(40);
    expect(nicknameFrom(long, []).length).toBe(32);
    expect(nicknameFrom(long, ['a'.repeat(32)]).length).toBeLessThanOrEqual(32);
  });
});
