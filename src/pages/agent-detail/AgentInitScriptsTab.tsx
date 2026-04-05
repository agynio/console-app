import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentInitScriptsTabProps = {
  agentId: string;
};

const truncate = (value: string, maxLength = 100) => {
  if (!value) return '—';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

export function AgentInitScriptsTab({ agentId }: AgentInitScriptsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [script, setScript] = useState('');
  const [description, setDescription] = useState('');
  const [scriptError, setScriptError] = useState('');

  const initScriptsQuery = useQuery({
    queryKey: ['initScripts', agentId, 'list'],
    queryFn: () => agentsClient.listInitScripts({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const initScripts = initScriptsQuery.data?.initScripts ?? [];

  const createInitScriptMutation = useMutation({
    mutationFn: (payload: { script: string; description: string; target: { case: 'agentId'; value: string } }) =>
      agentsClient.createInitScript(payload),
    onSuccess: () => {
      toast.success('Init script created.');
      void queryClient.invalidateQueries({ queryKey: ['initScripts', agentId, 'list'] });
      setCreateOpen(false);
      setScript('');
      setDescription('');
      setScriptError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create init script.');
    },
  });

  const handleCreate = () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setScriptError('Script is required.');
      return;
    }
    createInitScriptMutation.mutate({
      script: trimmedScript,
      description: description.trim(),
      target: { case: 'agentId', value: agentId },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="agent-init-scripts-heading">
            Init Scripts
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Scripts executed when the agent starts.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="agent-init-scripts-create"
        >
          Add init script
        </Button>
      </div>
      {initScriptsQuery.isPending ? (
        <div className="text-sm text-[var(--agyn-gray)]">Loading init scripts...</div>
      ) : null}
      {initScriptsQuery.isError ? (
        <div className="text-sm text-[var(--agyn-gray)]">Failed to load init scripts.</div>
      ) : null}
      {initScripts.length === 0 && !initScriptsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-init-scripts-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No init scripts configured.
          </CardContent>
        </Card>
      ) : null}
      {initScripts.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-init-scripts-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr]"
              data-testid="agent-init-scripts-header"
            >
              <span>Script</span>
              <span>Description</span>
              <span>Created</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {initScripts.map((initScript) => (
                <div
                  key={initScript.meta?.id ?? initScript.script}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr]"
                  data-testid="agent-init-script-row"
                >
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-init-script-value">
                    {truncate(initScript.script)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-init-script-description">
                    {initScript.description || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-init-script-created">
                    {formatDateOnly(initScript.meta?.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="agent-init-scripts-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-init-scripts-create-title">Add init script</DialogTitle>
            <DialogDescription data-testid="agent-init-scripts-create-description">
              Provide scripts executed during agent initialization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-[var(--agyn-dark)]">Script</label>
              <textarea
                className={`
                  w-full min-h-[140px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
                  text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)] font-mono
                  focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
                  ${scriptError ? 'border-red-500 focus:ring-red-500' : ''}
                `}
                value={script}
                onChange={(event) => {
                  setScript(event.target.value);
                  if (scriptError) setScriptError('');
                }}
                data-testid="agent-init-scripts-create-script"
              />
              {scriptError ? <p className="text-sm text-red-500">{scriptError}</p> : null}
            </div>
            <Input
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              data-testid="agent-init-scripts-create-description-input"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-init-scripts-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createInitScriptMutation.isPending}
              data-testid="agent-init-scripts-create-submit"
            >
              {createInitScriptMutation.isPending ? 'Adding...' : 'Add init script'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
