import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ImageVersionSchema } from '@/gen/agynio/api/images/v1/images_pb';
import { groupVersions, parseSemver, preselectedTag } from '@/lib/image-versions';

const version = (tag: string, pushedAt?: string) =>
  create(ImageVersionSchema, {
    tag,
    pushedAt: pushedAt ? timestampFromDate(new Date(pushedAt)) : undefined,
  });

describe('parseSemver', () => {
  it('accepts the shapes a registry actually publishes', () => {
    expect(parseSemver('1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('v1.2.3')).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('1.2.3-rc.1')).toMatchObject({ patch: 3, prerelease: 'rc.1' });
    expect(parseSemver('1.2.3+build.5')).toMatchObject({ major: 1, minor: 2, patch: 3 });
  });

  it('rejects what is not a version', () => {
    for (const tag of ['latest', 'sha-cc270c9', '1.2', 'main', '']) {
      expect(parseSemver(tag)).toBeNull();
    }
  });
});

describe('groupVersions', () => {
  it('puts semver tags in the list, newest first, and everything else behind show all', () => {
    const { release, other } = groupVersions([
      version('1.2.0'),
      version('latest'),
      version('1.10.0'),
      version('sha-cc270c9'),
      version('1.9.0'),
    ]);

    expect(release.map((entry) => entry.tag)).toEqual(['1.10.0', '1.9.0', '1.2.0']);
    expect(other.map((entry) => entry.tag)).toEqual(expect.arrayContaining(['latest', 'sha-cc270c9']));
  });

  it('orders a release ahead of its own prereleases', () => {
    const { release } = groupVersions([version('2.0.0-rc.1'), version('2.0.0'), version('2.0.0-rc.2')]);
    expect(release.map((entry) => entry.tag)).toEqual(['2.0.0', '2.0.0-rc.2', '2.0.0-rc.1']);
  });

  // 1.10.0 is newer than 1.9.0; a string sort would say otherwise.
  it('compares version fields numerically', () => {
    const { release } = groupVersions([version('1.9.0'), version('1.10.0')]);
    expect(release[0].tag).toBe('1.10.0');
  });

  it('falls back to push time where a repository does not use semver', () => {
    const { other } = groupVersions([
      version('main', '2026-01-01T00:00:00Z'),
      version('nightly', '2026-06-01T00:00:00Z'),
    ]);
    expect(other.map((entry) => entry.tag)).toEqual(['nightly', 'main']);
  });

  // latest gets no special standing: an alias the platform re-resolved on its
  // own would make "which version is this running" unanswerable.
  it('gives latest no standing of its own', () => {
    const { release, other } = groupVersions([version('latest'), version('1.0.0')]);
    expect(release.map((entry) => entry.tag)).toEqual(['1.0.0']);
    expect(other.map((entry) => entry.tag)).toEqual(['latest']);
  });
});

describe('preselectedTag', () => {
  it('picks the newest semver so creating an environment needs no decision', () => {
    expect(preselectedTag([version('1.2.0'), version('latest'), version('2.0.0')])).toBe('2.0.0');
  });

  it('falls back to the most recently pushed when nothing parses', () => {
    expect(
      preselectedTag([
        version('main', '2026-01-01T00:00:00Z'),
        version('nightly', '2026-06-01T00:00:00Z'),
      ]),
    ).toBe('nightly');
  });

  it('is undefined when nothing has been discovered', () => {
    expect(preselectedTag([])).toBeUndefined();
  });
});
