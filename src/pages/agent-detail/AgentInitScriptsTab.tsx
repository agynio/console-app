import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/Input';
import { ScriptEditor } from '@/components/ScriptEditor';
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
import type { InitScript } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly, truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentInitScriptsTabProps = {
  agentId: string;
};

export function AgentInitScriptsTab({ agentId }: AgentInitScriptsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createScript, setCreateScript] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createScriptError, setCreateScriptError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editInitScriptId, setEditInitScriptId] = useState<string | null>(null);
  const [editScript, setEditScript] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editScriptError, setEditScriptError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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
      setCreateScript('');
      setCreateDescription('');
      setCreateScriptError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create init script.');
    },
  });

  const updateInitScriptMutation = useMutation({
    mutationFn: (payload: { id: string; script?: string; description?: string }) =>
      agentsClient.updateInitScript(payload),
    onSuccess: () => {
      toast.success('Init script updated.');
      void queryClient.invalidateQueries({ queryKey: ['initScripts', agentId, 'list'] });
      setEditOpen(false);
      setEditInitScriptId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update init script.');
    },
  });

  const deleteInitScriptMutation = useMutation({
    mutationFn: (initId: string) => agentsClient.deleteInitScript({ id: initId }),
    onSuccess: () => {
      toast.success('Init script deleted.');
      void queryClient.invalidateQueries({ queryKey: ['initScripts', agentId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete init script.');
    },
  });

  const handleCreate = () => {
    const trimmedScript = createScript.trim();
    if (!trimmedScript) {
      setCreateScriptError('Script is required.');
      return;
    }
    createInitScriptMutation.mutate({
      script: trimmedScript,
      description: createDescription.trim(),
      target: { case: 'agentId', value: agentId },
    });
  };

  const handleEditOpen = (initScript: InitScript) => {
    const initId = initScript.meta?.id;
    if (!initId) {
      toast.error('Missing init script ID.');
      return;
    }
    setEditInitScriptId(initId);
    setEditScript(initScript.script);
    setEditDescription(initScript.description);
    setEditScriptError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedScript = editScript.trim();
    if (!trimmedScript) {
      setEditScriptError('Script is required.');
      return;
    }
    if (!editInitScriptId) {
      toast.error('Missing init script ID.');
      return;
    }
    updateInitScriptMutation.mutate({
      id: editInitScriptId,
      script: trimmedScript,
      description: editDescription.trim(),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditInitScriptId(null);
      setEditScript('');
      setEditDescription('');
      setEditScriptError('');
    }
  };

  const handleDeleteOpen = (initScript: InitScript) => {
    const initId = initScript.meta?.id;
    if (!initId) {
      toast.error('Missing init script ID.');
      return;
    }
    setDeleteTargetId(initId);
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
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="agent-init-scripts-header"
            >
              <span>Script</span>
              <span>Description</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {initScripts.map((initScript) => (
                <div
                  key={initScript.meta?.id ?? initScript.script}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_120px]"
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
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOpen(initScript)}
                      data-testid="agent-init-script-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteOpen(initScript)}
                      data-testid="agent-init-script-delete"
                    >
                      Delete
                    </Button>
                  </div>
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
            <ScriptEditor
              label="Script"
              value={createScript}
              onChange={(event) => {
                setCreateScript(event.target.value);
                if (createScriptError) setCreateScriptError('');
              }}
              error={createScriptError}
              monospace
              data-testid="agent-init-scripts-create-script"
            />
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
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
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-init-scripts-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-init-scripts-edit-title">Edit init script</DialogTitle>
            <DialogDescription data-testid="agent-init-scripts-edit-description">
              Update init script details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ScriptEditor
              label="Script"
              value={editScript}
              onChange={(event) => {
                setEditScript(event.target.value);
                if (editScriptError) setEditScriptError('');
              }}
              error={editScriptError}
              monospace
              data-testid="agent-init-scripts-edit-script"
            />
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="agent-init-scripts-edit-description-input"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-init-scripts-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateInitScriptMutation.isPending}
              data-testid="agent-init-scripts-edit-submit"
            >
              {updateInitScriptMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete init script"
        description="This action permanently removes the init script."
        confirmLabel="Delete init script"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteInitScriptMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteInitScriptMutation.isPending}
      />
    </div>
  );
}
