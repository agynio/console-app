import { describe, expect, it } from 'vitest';
import { ThreadStatus } from '@/gen/agynio/api/threads/v1/threads_pb';
import { formatThreadStatus } from '@/lib/format';

describe('formatThreadStatus', () => {
  it('formats active status', () => {
    expect(formatThreadStatus(ThreadStatus.ACTIVE)).toBe('Active');
  });

  it('formats archived status', () => {
    expect(formatThreadStatus(ThreadStatus.ARCHIVED)).toBe('Archived');
  });

  it('formats degraded status', () => {
    expect(formatThreadStatus(ThreadStatus.DEGRADED)).toBe('Degraded');
  });

  it('formats unspecified status', () => {
    expect(formatThreadStatus(ThreadStatus.UNSPECIFIED)).toBe('Unspecified');
  });
});
