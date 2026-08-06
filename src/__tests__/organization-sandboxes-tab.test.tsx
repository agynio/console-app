import { SessionKind } from '@/gen/agynio/api/terminal_proxy/v1/terminal_proxy_pb';
import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageTitleProvider } from '@/context/PageTitleContext';
import {
  EntityMetaSchema,
  SandboxSchema,
  SandboxStatus,
} from '@/gen/agynio/api/agents/v1/agents_pb';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { OrganizationSandboxesTab } from '@/pages/OrganizationSandboxesTab';
import { SandboxTerminal } from '@/components/SandboxTerminal';

const { listSandboxes, stopSandbox, deleteSandbox, createTerminalSession } = vi.hoisted(() => ({
  listSandboxes: vi.fn(),
  stopSandbox: vi.fn(),
  deleteSandbox: vi.fn(),
  createTerminalSession: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  agentsClient: {
    listSandboxes,
    stopSandbox,
    deleteSandbox,
  },
  terminalClient: {
    createTerminalSession,
  },
}));

const { terminalInstances } = vi.hoisted(() => ({
  terminalInstances: [] as Array<Record<string, unknown>>,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    write = vi.fn();
    open = vi.fn();
    loadAddon = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));
    constructor() {
      terminalInstances.push(this as unknown as Record<string, unknown>);
    }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  binaryType = 'blob';
  sent: Array<string | ArrayBufferView> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string | ArrayBufferView) {
    this.sent.push(data);
  }
}

function makeSandbox(overrides: {
  id: string;
  name: string;
  status: SandboxStatus;
  environmentName?: string;
}) {
  return create(SandboxSchema, {
    meta: create(EntityMetaSchema, { id: overrides.id }),
    organizationId: 'org-1',
    name: overrides.name,
    environmentId: 'env-1',
    environmentName: overrides.environmentName ?? 'python-dev',
    ownerId: 'identity-1',
    status: overrides.status,
    idleTimeout: '30m',
    ttl: '24h',
    lastSessionAt: timestampFromDate(new Date('2026-01-02T03:04:05Z')),
  });
}

function renderSandboxesTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/organizations/org-1/sandboxes']}>
            <Routes>
              <Route path="/organizations/:id/sandboxes" element={<OrganizationSandboxesTab />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </PageTitleProvider>,
  );
}

describe('OrganizationSandboxesTab', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listSandboxes.mockReset();
    stopSandbox.mockReset();
    deleteSandbox.mockReset();
  });

  it('renders sandboxes with environment, status and last session', async () => {
    listSandboxes.mockResolvedValue({
      sandboxes: [
        makeSandbox({ id: 'sandbox-1', name: 'scratch', status: SandboxStatus.RUNNING }),
        makeSandbox({
          id: 'sandbox-2',
          name: 'archived',
          status: SandboxStatus.STOPPED,
          environmentName: 'node-dev',
        }),
      ],
      nextPageToken: '',
    });

    renderSandboxesTab();

    expect(await screen.findByText('scratch')).toBeTruthy();
    expect(screen.getByText('archived')).toBeTruthy();
    expect(screen.getAllByTestId('organization-sandbox-row')).toHaveLength(2);
    expect(screen.getByText('python-dev')).toBeTruthy();
    expect(screen.getByText('node-dev')).toBeTruthy();

    // Rows default to sorting by name ascending, so `archived` precedes `scratch`.
    const names = screen.getAllByTestId('organization-sandbox-name').map((node) => node.textContent);
    expect(names).toEqual(['archived', 'scratch']);
    const statuses = screen.getAllByTestId('organization-sandbox-status').map((node) => node.textContent);
    expect(statuses).toEqual(['Stopped', 'Running']);

    await waitFor(() => {
      expect(listSandboxes).toHaveBeenCalledWith({
        organizationId: 'org-1',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: '',
      });
    });
  });

  it('stops a sandbox through the confirm dialog', async () => {
    listSandboxes.mockResolvedValue({
      sandboxes: [makeSandbox({ id: 'sandbox-1', name: 'scratch', status: SandboxStatus.RUNNING })],
      nextPageToken: '',
    });
    stopSandbox.mockResolvedValue({});

    renderSandboxesTab();

    fireEvent.click(await screen.findByTestId('organization-sandbox-stop'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(stopSandbox).toHaveBeenCalledWith({ id: 'sandbox-1' });
    });
    expect(deleteSandbox).not.toHaveBeenCalled();
  });

  it('deletes a sandbox through the confirm dialog', async () => {
    listSandboxes.mockResolvedValue({
      sandboxes: [makeSandbox({ id: 'sandbox-1', name: 'scratch', status: SandboxStatus.STOPPED })],
      nextPageToken: '',
    });
    deleteSandbox.mockResolvedValue({});

    renderSandboxesTab();

    fireEvent.click(await screen.findByTestId('organization-sandbox-delete'));
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(deleteSandbox).toHaveBeenCalledWith({ id: 'sandbox-1' });
    });
    expect(stopSandbox).not.toHaveBeenCalled();
  });

  it('disables stop for a sandbox that is not running', async () => {
    listSandboxes.mockResolvedValue({
      sandboxes: [makeSandbox({ id: 'sandbox-1', name: 'scratch', status: SandboxStatus.STOPPED })],
      nextPageToken: '',
    });

    renderSandboxesTab();

    const stopButton = (await screen.findByTestId('organization-sandbox-stop')) as HTMLButtonElement;
    expect(stopButton.disabled).toBe(true);
  });
});

describe('SandboxTerminal', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    MockWebSocket.instances = [];
    terminalInstances.length = 0;
    createTerminalSession.mockReset();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    globalThis.WebSocket = originalWebSocket;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('mounts, dials the ticketed URL and sends the JSON handshake', async () => {
    createTerminalSession.mockResolvedValue({
      ticket: 'ticket-abc',
      websocketUrl: 'https://terminal.example.test/terminal',
      expiresInSeconds: 30,
    });

    expect(() => render(<SandboxTerminal workloadId="workload-1" />)).not.toThrow();

    expect(screen.getByTestId('sandbox-terminal-host')).toBeTruthy();

    await waitFor(() => {
      expect(createTerminalSession).toHaveBeenCalledWith({
        workloadId: 'workload-1',
        containerName: 'main',
        kind: SessionKind.SHELL,
      });
    });

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    const socket = MockWebSocket.instances[0];
    // The ticket travels as a query param and https is normalised to wss.
    expect(socket.url).toBe('wss://terminal.example.test/terminal?ticket=ticket-abc');
    expect(socket.binaryType).toBe('arraybuffer');

    socket.onopen?.();
    expect(socket.sent[0]).toBe(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));

    // Binary frames are raw PTY bytes; text frames are JSON control messages.
    const payload = new TextEncoder().encode('hello');
    socket.onmessage?.({ data: payload.buffer } as MessageEvent);
    await waitFor(() => {
      expect(terminalInstances[0].write).toHaveBeenCalled();
    });

    socket.onmessage?.({ data: JSON.stringify({ type: 'exit', code: 0, reason: 'completed' }) } as MessageEvent);
    expect(await screen.findByText(/exit 0: completed/)).toBeTruthy();
  });

  it('surfaces a ticket failure without crashing', async () => {
    createTerminalSession.mockRejectedValue(new Error('permission denied'));

    render(<SandboxTerminal workloadId="workload-1" />);

    expect(await screen.findByTestId('sandbox-terminal-error')).toBeTruthy();
    expect(screen.getByTestId('sandbox-terminal-error').textContent).toContain('permission denied');
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
