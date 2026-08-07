import { describe, expect, it } from 'vitest';
import { CLUSTER_NAV_GROUPS, ORGANIZATION_NAV_GROUPS, type NavGroup } from '@/layout/navigation';

const EXPECTED_ORGANIZATION_STRUCTURE: Array<[string, string[]]> = [
  ['Organization', ['Overview', 'Members', 'Groups']],
  ['Agents & Apps', ['Agents', 'Apps']],
  ['Runtime', ['Images', 'Environments', 'Runners']],
  ['Networking', ['Private Networks', 'Private Resources', 'Egress Rules']],
  ['LLM', ['Providers', 'Models']],
  ['Credentials', ['Secrets', 'Secret Providers']],
  ['Operations', ['Threads', 'Instances', 'Workloads', 'Sandboxes', 'Provisioned Storage', 'Usage']],
];

const sectionsOf = (groups: NavGroup[]) => groups.flatMap((group) => group.sections);

describe('organization navigation', () => {
  it('has the seven groups in order, each with its sections', () => {
    expect(ORGANIZATION_NAV_GROUPS.map((group) => [group.label, group.sections.map((section) => section.label)])).toEqual(
      EXPECTED_ORGANIZATION_STRUCTURE,
    );
  });

  it('has 21 sections and no ungrouped items', () => {
    expect(sectionsOf(ORGANIZATION_NAV_GROUPS)).toHaveLength(21);
  });

  it('never repeats a section name in its own group header', () => {
    ORGANIZATION_NAV_GROUPS.forEach((group) => {
      expect(group.sections.map((section) => section.label)).not.toContain(group.label);
    });
  });
});

describe.each([
  ['organization', ORGANIZATION_NAV_GROUPS],
  ['cluster', CLUSTER_NAV_GROUPS],
])('%s context', (_context, groups) => {
  it('uses a unique icon per section', () => {
    const icons = sectionsOf(groups).map((section) => section.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('uses a unique path and test id per section', () => {
    const sections = sectionsOf(groups);
    expect(new Set(sections.map((section) => section.path)).size).toBe(sections.length);
    expect(new Set(sections.map((section) => section.testId)).size).toBe(sections.length);
  });

  it('uses a unique group id', () => {
    expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
  });
});
