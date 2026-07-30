import { useCallback, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { Button } from '@/components/ui/button';
import { TerminalSession, type TerminalExit, type TerminalSessionState } from '@/lib/terminalSession';
import '@xterm/xterm/css/xterm.css';

/** The proxy resolves this alias to the workload's MAIN-role container. */
const MAIN_CONTAINER = 'main';

type SandboxTerminalProps = {
  workloadId: string;
  containerName?: string;
};

export function SandboxTerminal({ workloadId, containerName = MAIN_CONTAINER }: SandboxTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<TerminalSessionState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<TerminalExit | null>(null);
  // The protocol has no resume: reconnecting means a fresh ticket, PTY and
  // shell, so the attempt counter re-runs the whole effect.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !workloadId) return;

    setState('connecting');
    setError(null);
    setExit(null);

    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);
    fitAddon.fit();

    const session = new TerminalSession({
      onOutput: (bytes) => term.write(bytes),
      onExit: (result) => setExit(result),
      onError: (message) => setError(message),
      onStateChange: (next) => setState(next),
    });

    const dataSub = term.onData((data) => session.send(data));
    const resizeSub = term.onResize(({ cols, rows }) => session.resize(cols, rows));

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // fit() throws while the pane is detached or has no measurable size.
      }
    });
    observer.observe(host);

    void session.open({ workloadId, containerName, cols: term.cols, rows: term.rows });

    return () => {
      observer.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      session.close();
      term.dispose();
    };
  }, [workloadId, containerName, attempt]);

  const handleReconnect = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const statusLabel =
    error ? 'Disconnected' : state === 'connecting' ? 'Connecting...' : state === 'connected' ? 'Connected' : 'Session ended';
  const isEnded = state === 'closed' || Boolean(error);

  return (
    <div className="space-y-3" data-testid="sandbox-terminal">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground" data-testid="sandbox-terminal-status">
          {statusLabel}
          {exit ? ` (exit ${exit.code}: ${exit.reason})` : ''}
        </div>
        {isEnded ? (
          <Button variant="outline" size="sm" onClick={handleReconnect} data-testid="sandbox-terminal-reconnect">
            Reconnect
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="text-sm text-destructive" data-testid="sandbox-terminal-error">
          {error}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="h-96 w-full overflow-hidden rounded-md bg-black p-2"
        data-testid="sandbox-terminal-host"
      />
    </div>
  );
}
