import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SessionKind } from '@/gen/agynio/api/terminal_proxy/v1/terminal_proxy_pb';

const { createTerminalSession } = vi.hoisted(() => ({ createTerminalSession: vi.fn() }));

vi.mock('@/api/client', () => ({
  terminalClient: { createTerminalSession },
}));

// An unspecified kind is rejected rather than defaulted, so the browser
// terminal has to name the one it wants. Omitting it broke the Console's
// terminal with "kind is required".
describe('terminal session', () => {
  beforeEach(() => {
    createTerminalSession.mockReset();
    createTerminalSession.mockResolvedValue({ ticket: '', websocketUrl: '' });
  });

  it('requests a SHELL session', async () => {
    const { TerminalSession } = await import('@/lib/terminalSession');
    const session = new TerminalSession({ onError: vi.fn(), onData: vi.fn() });
    await session.open({ workloadId: 'w', containerName: 'main' });

    expect(createTerminalSession).toHaveBeenCalledTimes(1);
    expect(createTerminalSession.mock.calls[0][0]).toMatchObject({
      workloadId: 'w',
      containerName: 'main',
      kind: SessionKind.SHELL,
    });
    expect(createTerminalSession.mock.calls[0][0].kind).not.toBe(SessionKind.UNSPECIFIED);
  });
});
