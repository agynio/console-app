import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '@/lib/download';

describe('downloadTextFile', () => {
  const createObjectURL = vi.fn(() => 'blob:token');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clicks an anchor naming the file, then releases the object URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('tunnel-tunnel-1.jwt');
      expect(this.href).toContain('blob:token');
      expect(this.isConnected).toBe(true);
    });

    downloadTextFile('header.payload.signature', 'tunnel-tunnel-1.jwt');

    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:token');
  });
});
