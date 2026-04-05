import { describe, expect, it } from 'vitest';
import { entriesToLabels, labelsToEntries, type LabelEntry } from '@/lib/labels';

describe('labels utilities', () => {
  it('returns empty entries for empty labels', () => {
    expect(labelsToEntries({})).toEqual([]);
  });

  it('returns empty labels for empty entries', () => {
    expect(entriesToLabels([])).toEqual({});
  });

  it('filters whitespace-only keys', () => {
    const entries: LabelEntry[] = [
      { id: '1', key: '   ', value: 'ignored' },
      { id: '2', key: 'region', value: '  us-east  ' },
    ];

    expect(entriesToLabels(entries)).toEqual({ region: 'us-east' });
  });

  it('deduplicates keys with last-write-wins', () => {
    const entries: LabelEntry[] = [
      { id: '1', key: 'alpha', value: 'first' },
      { id: '2', key: ' alpha ', value: ' second ' },
    ];

    expect(entriesToLabels(entries)).toEqual({ alpha: 'second' });
  });

  it('round-trips labels through entries', () => {
    const labels = { env: 'prod', region: 'us-east-1' };
    const entries = labelsToEntries(labels);
    const result = entriesToLabels(entries);

    expect(result).toEqual(labels);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: expect.any(String), value: expect.any(String) });
    expect(entries[0].id).toEqual(expect.any(String));
  });
});
