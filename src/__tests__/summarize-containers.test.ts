import { describe, expect, it } from 'vitest';
import { ContainerStatus } from '@/gen/agynio/api/runners/v1/runners_pb';
import { EMPTY_PLACEHOLDER, summarizeContainers } from '@/lib/format';

describe('summarizeContainers', () => {
  it('returns placeholder for empty containers', () => {
    expect(summarizeContainers([])).toBe(EMPTY_PLACEHOLDER);
  });

  it('groups containers by status and reason', () => {
    const summary = summarizeContainers([
      { status: ContainerStatus.WAITING, reason: 'CrashLoopBackOff' },
      { status: ContainerStatus.WAITING, reason: ' CrashLoopBackOff ' },
      { status: ContainerStatus.WAITING, reason: 'ImagePullBackOff' },
      { status: ContainerStatus.RUNNING },
      { status: ContainerStatus.TERMINATED, reason: 'Completed' },
    ]);

    expect(summary).toBe(
      'Running (1), Terminated (Completed) (1), Waiting (CrashLoopBackOff) (2), Waiting (ImagePullBackOff) (1)',
    );
  });
});
