import { describe, expect, it } from 'vitest';
import { DeviceStatus } from '@/gen/agynio/api/users/v1/users_pb';
import { formatDeviceStatus } from '@/lib/format';

describe('formatDeviceStatus', () => {
  it('formats pending status', () => {
    expect(formatDeviceStatus(DeviceStatus.PENDING)).toBe('Pending');
  });

  it('formats enrolled status', () => {
    expect(formatDeviceStatus(DeviceStatus.ENROLLED)).toBe('Enrolled');
  });

  it('formats unspecified status', () => {
    expect(formatDeviceStatus(DeviceStatus.UNSPECIFIED)).toBe('Unspecified');
  });
});
