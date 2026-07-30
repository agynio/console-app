import { terminalClient } from '@/api/client';

/**
 * Browser client for the Terminal Proxy wire protocol, mirroring the CLI's
 * Go implementation (agyn-cli/internal/terminal).
 *
 * Establishment: CreateTerminalSession issues a single-use ticket (30s TTL)
 * plus a bare WebSocket URL; the client appends the ticket as a query param
 * and dials. The ticket is the only credential on the socket — no headers,
 * no subprotocol.
 *
 * Framing is hybrid: binary frames carry raw PTY bytes in both directions
 * (stdout and stderr are merged and indistinguishable), text frames carry
 * JSON control messages. The only client control message is `resize`; the
 * only server control message is `exit`.
 */

export type TerminalExit = {
  code: number;
  reason: string;
};

export type TerminalSessionState = 'connecting' | 'connected' | 'closed';

export type TerminalSessionHandlers = {
  onOutput: (bytes: Uint8Array) => void;
  onExit: (exit: TerminalExit) => void;
  onError: (message: string) => void;
  onStateChange?: (state: TerminalSessionState) => void;
};

export type TerminalSessionTarget = {
  workloadId: string;
  containerName: string;
  cols: number;
  rows: number;
};

/**
 * The proxy never raises nhooyr/websocket's default 32 KiB read limit and
 * drops the session with close 1009 on anything larger, so pasted input is
 * split well below that ceiling.
 */
const STDIN_CHUNK_BYTES = 16 * 1024;

/** The proxy rejects a zero dimension; xterm.js reports 0 for a hidden pane. */
function clampDimension(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

/** binaryType is 'arraybuffer', but views are normalised too for safety. */
function toBytes(data: unknown): Uint8Array | null {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  // Cross-realm ArrayBuffer: `instanceof` fails but the shape still holds.
  if (typeof data === 'object' && data !== null && typeof (data as ArrayBuffer).byteLength === 'number') {
    return new Uint8Array(data as ArrayBuffer);
  }
  return null;
}

/**
 * Mirrors the CLI's ticketURL: the RPC returns a bare URL (a different host
 * from the API), so the scheme is normalised to ws/wss and the ticket is added
 * as a query parameter while preserving any params already present.
 */
export function terminalWebSocketUrl(websocketUrl: string, ticket: string): string {
  const url = new URL(websocketUrl, window.location.href);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`Unsupported terminal proxy scheme ${url.protocol}`);
  }
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

export class TerminalSession {
  private readonly handlers: TerminalSessionHandlers;
  private readonly encoder = new TextEncoder();
  private socket: WebSocket | null = null;
  private disposed = false;
  private sawExit = false;
  private lastCols = 0;
  private lastRows = 0;

  constructor(handlers: TerminalSessionHandlers) {
    this.handlers = handlers;
  }

  async open(target: TerminalSessionTarget): Promise<void> {
    this.handlers.onStateChange?.('connecting');

    let ticket: string;
    let websocketUrl: string;
    try {
      const session = await terminalClient.createTerminalSession({
        workloadId: target.workloadId,
        containerName: target.containerName,
      });
      ticket = session.ticket;
      websocketUrl = session.websocketUrl;
    } catch (error) {
      if (this.disposed) return;
      this.fail(error instanceof Error ? error.message : 'Failed to create terminal session.');
      return;
    }

    // close() may have run while the ticket request was in flight.
    if (this.disposed) return;

    if (!websocketUrl) {
      this.fail('Terminal proxy did not return a WebSocket URL.');
      return;
    }

    let url: string;
    try {
      url = terminalWebSocketUrl(websocketUrl, ticket);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Invalid terminal proxy URL.');
      return;
    }

    // No subprotocol: the proxy selects none, and a browser fails the
    // connection when it requests one the server does not echo back.
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    this.lastCols = clampDimension(target.cols);
    this.lastRows = clampDimension(target.rows);

    socket.onopen = () => {
      // The proxy blocks on this handshake before resolving the workload; it
      // must be the first frame and must be JSON text with non-zero dimensions.
      this.sendControl({ type: 'resize', cols: this.lastCols, rows: this.lastRows });
      this.handlers.onStateChange?.('connected');
    };

    socket.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      // Text frames are JSON control messages; everything else is raw PTY
      // output. Dispatching on `string` rather than on the binary type keeps
      // this correct when the buffer comes from another realm.
      if (typeof data === 'string') {
        this.handleControl(data);
        return;
      }
      const bytes = toBytes(data);
      if (bytes) this.handlers.onOutput(bytes);
    };

    socket.onerror = () => {
      // The 401 for a rejected ticket happens before the upgrade, so the
      // browser only ever surfaces it as an opaque failure.
      if (this.disposed || this.sawExit) return;
      this.handlers.onError('Terminal connection failed.');
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.disposed) return;
      // The proxy can close normally without an exit frame (exec stream EOF);
      // the CLI treats that as an abnormal end, so we do too.
      if (!this.sawExit) {
        this.handlers.onExit({ code: 1, reason: 'error' });
      }
      this.handlers.onStateChange?.('closed');
    };
  }

  /** Sends terminal input as binary frames, chunked under the proxy read limit. */
  send(data: string): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const bytes = this.encoder.encode(data);
    for (let offset = 0; offset < bytes.length; offset += STDIN_CHUNK_BYTES) {
      socket.send(bytes.subarray(offset, offset + STDIN_CHUNK_BYTES));
    }
  }

  resize(cols: number, rows: number): void {
    const nextCols = clampDimension(cols);
    const nextRows = clampDimension(rows);
    if (nextCols === this.lastCols && nextRows === this.lastRows) return;
    this.lastCols = nextCols;
    this.lastRows = nextRows;
    this.sendControl({ type: 'resize', cols: nextCols, rows: nextRows });
  }

  close(): void {
    this.disposed = true;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  private handleControl(raw: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof frame !== 'object' || frame === null) return;

    const { type, code, reason } = frame as { type?: unknown; code?: unknown; reason?: unknown };
    if (type !== 'exit') return;

    this.sawExit = true;
    this.handlers.onExit({
      code: typeof code === 'number' ? code : 1,
      reason: typeof reason === 'string' ? reason : 'error',
    });
  }

  private sendControl(frame: { type: 'resize'; cols: number; rows: number }): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // Any client text frame the proxy cannot parse as a `resize` kills the
    // session, so this is the only text frame we ever emit.
    socket.send(JSON.stringify(frame));
  }

  private fail(message: string): void {
    this.handlers.onError(message);
    this.handlers.onStateChange?.('closed');
  }
}
