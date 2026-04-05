import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScriptEditor } from '@/components/ScriptEditor';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { InitScript } from '@/gen/agynio/api/agents/v1/agents_pb';
import { truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type NestedInitScriptsDialogProps = {
  targetCase: 'mcpId' | 'hookId';
  targetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
};

export function NestedInitScriptsDialog({
  targetCase,
  targetId,
  open,
  onOpenChange,
  title = 'Init Scripts',
  description = 'Manage init scripts.',
}: NestedInitScriptsDialogProps) {
  const queryClient = useQueryClient();
  const [script, setScript] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [scriptError, setScriptError] = useState('');

  useEffect(() => {
    if (!open) return;
    setScript('');
    setScriptDescription('');
    setScriptError('');
  }, [open, targetId]);

  const initScriptsQuery = useQuery({
    queryKey: ['initScripts', targetCase, targetId, 'list'],
    queryFn: () => {
      if (!targetId) {
        return Promise.reject(new Error('Missing target ID.'));
      }
      return targetCase === 'mcpId'
        ? agentsClient.listInitScripts({ mcpId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' })
        : agentsClient.listInitScripts({ hookId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' });
    },
    enabled: Boolean(targetId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const initScripts = initScriptsQuery.data?.initScripts ?? [];

  const createInitScriptMutation = useMutation({
    mutationFn: (payload: {
      script: string;
      description: string;
      target: { case: 'mcpId'; value: string } | { case: 'hookId'; value: string };
    }) => agentsClient.createInitScript(payload),
    onSuccess: () => {
      toast.success('Init script added.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['initScripts', targetCase, targetId, 'list'] });
      }
      setScript('');
      setScriptDescription('');
      setScriptError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add init script.');
    },
  });

  const deleteInitScriptMutation = useMutation({
    mutationFn: (initId: string) => agentsClient.deleteInitScript({ id: initId }),
    onSuccess: () => {
      toast.success('Init script removed.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['initScripts', targetCase, targetId, 'list'] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete init script.');
    },
  });

  const handleCreate = () => {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setScriptError('Script is required.');
      return;
    }
    if (!targetId) {
      toast.error('Missing target ID.');
      return;
    }

    const target =
      targetCase === 'mcpId'
        ? ({ case: 'mcpId', value: targetId } as const)
        : ({ case: 'hookId', value: targetId } as const);

    createInitScriptMutation.mutate({
      script: trimmedScript,
      description: scriptDescription.trim(),
      target,
    });
  };

  const handleDelete = (scriptEntry: InitScript) => {
    const initId = scriptEntry.meta?.id;
    if (!initId) {
      toast.error('Missing init script ID.');
      return;
    }
    deleteInitScriptMutation.mutate(initId);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent data-testid="nested-init-dialog">
        <DialogHeader>
          <DialogTitle data-testid="nested-init-title">{title}</DialogTitle>
          <DialogDescription data-testid="nested-init-description">{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <ScriptEditor
              label="Script"
              value={script}
              onChange={(event) => {
                setScript(event.target.value);
                if (scriptError) setScriptError('');
              }}
              error={scriptError}
              monospace
              minHeightClass="min-h-[120px]"
              data-testid="nested-init-script"
            />
            <Input
              label="Description"
              value={scriptDescription}
              onChange={(event) => setScriptDescription(event.target.value)}
              data-testid="nested-init-description-input"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreate}
              disabled={createInitScriptMutation.isPending}
              data-testid="nested-init-add"
            >
              {createInitScriptMutation.isPending ? 'Adding...' : 'Add init script'}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--agyn-dark)]">Existing init scripts</div>
            {initScriptsQuery.isPending ? (
              <div className="text-xs text-[var(--agyn-gray)]">Loading init scripts...</div>
            ) : null}
            {initScriptsQuery.isError ? (
              <div className="text-xs text-[var(--agyn-gray)]">Failed to load init scripts.</div>
            ) : null}
            {initScripts.length === 0 && !initScriptsQuery.isPending ? (
              <div className="text-xs text-[var(--agyn-gray)]">No init scripts configured.</div>
            ) : null}
            {initScripts.length > 0 ? (
              <div className="divide-y divide-[var(--agyn-border-subtle)] rounded-md border border-[var(--agyn-border-subtle)]">
                {initScripts.map((scriptEntry) => (
                  <div key={scriptEntry.meta?.id ?? scriptEntry.script} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-sm text-[var(--agyn-dark)]">{truncate(scriptEntry.script)}</div>
                      <div className="text-xs text-[var(--agyn-gray)]">{scriptEntry.description || '—'}</div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(scriptEntry)}
                      disabled={deleteInitScriptMutation.isPending}
                      data-testid="nested-init-delete"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid="nested-init-close">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
