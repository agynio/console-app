import type { ImageVersion } from '@/gen/agynio/api/images/v1/images_pb';
import { timestampToMillis } from '@/lib/format';

// A repository holds far more tags than anyone should be shown. The platform's
// own convention publishes `sha-<short>`, a semver, and `latest` into one
// repository, so even a well-behaved image arrives with three families of tag
// where only one is ever the right answer.
//
// So the picker is opinionated: semver tags are the list, newest first;
// everything else sits behind "show all tags".

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

type Semver = {
  major: number;
  minor: number;
  patch: number;
  // Absent means a release, which outranks any prerelease of the same version.
  prerelease?: string;
};

export const parseSemver = (tag: string): Semver | null => {
  const match = SEMVER.exec(tag);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
};

// Ordering follows semver: numeric fields descending, and a release ahead of
// its own prereleases. Prereleases compare as strings, which is enough to keep
// rc.2 ahead of rc.1 without implementing the full precedence rules.
const compareSemver = (left: Semver, right: Semver): number => {
  if (left.major !== right.major) return right.major - left.major;
  if (left.minor !== right.minor) return right.minor - left.minor;
  if (left.patch !== right.patch) return right.patch - left.patch;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === undefined) return -1;
  if (right.prerelease === undefined) return 1;
  return right.prerelease.localeCompare(left.prerelease);
};

const pushedAtMillis = (version: ImageVersion): number =>
  version.pushedAt ? timestampToMillis(version.pushedAt) : 0;

export type VersionGroups = {
  // Tags that parse as semver, newest first. The default list.
  release: ImageVersion[];
  // Everything else — sha-*, latest, branch names — behind "show all tags".
  other: ImageVersion[];
};

/**
 * Splits discovered versions into the list a picker shows by default and the
 * rest. `latest` gets no special standing: an alias the platform re-resolved on
 * its own would make "which version is this environment running" unanswerable.
 */
export const groupVersions = (versions: ImageVersion[]): VersionGroups => {
  const release: Array<{ version: ImageVersion; semver: Semver }> = [];
  const other: ImageVersion[] = [];

  for (const version of versions) {
    const semver = parseSemver(version.tag);
    if (semver) {
      release.push({ version, semver });
      continue;
    }
    other.push(version);
  }

  release.sort((left, right) => compareSemver(left.semver, right.semver));
  // Where a repository does not use semver, push time is the only ordering
  // signal there is.
  other.sort((left, right) => pushedAtMillis(right) - pushedAtMillis(left));

  return { release: release.map((entry) => entry.version), other };
};

/**
 * The tag a picker preselects, so creating an environment takes no version
 * decision at all. The newest semver tag when there is one; otherwise the most
 * recently pushed of whatever the repository does use.
 */
export const preselectedTag = (versions: ImageVersion[]): string | undefined => {
  const { release, other } = groupVersions(versions);
  return release[0]?.tag ?? other[0]?.tag;
};
