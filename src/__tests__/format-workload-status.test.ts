import { describe, expect, it } from 'vitest';
import { WorkloadStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { formatWorkloadStatus } from '@/lib/format';

describe('formatWorkloadStatus', () => {
  it('formats starting status', () => {
    expect(formatWorkloadStatus(WorkloadStatus.STARTING)).toBe('Starting');
  });

  it('formats running status as started', () => {
    expect(formatWorkloadStatus(WorkloadStatus.RUNNING)).toBe('Started');
  });

  it('formats stopping status', () => {
    expect(formatWorkloadStatus(WorkloadStatus.STOPPING)).toBe('Stopping');
  });

  it('formats stopped status', () => {
    expect(formatWorkloadStatus(WorkloadStatus.STOPPED)).toBe('Stopped');
  });

  it('formats failed status', () => {
    expect(formatWorkloadStatus(WorkloadStatus.FAILED)).toBe('Failed');
  });

  it('formats unspecified status', () => {
    expect(formatWorkloadStatus(WorkloadStatus.UNSPECIFIED)).toBe('Unspecified');
  });
});
