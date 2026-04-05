import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ComputeResourcesEditor } from '@/components/ComputeResourcesEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ComputeResources, Hook } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly, truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { NestedEnvsDialog } from '@/pages/agent-detail/NestedEnvsDialog';
import { NestedInitScriptsDialog } from '@/pages/agent-detail/NestedInitScriptsDialog';
import { toast } from 'sonner';

type AgentHooksTabProps = {
  agentId: string;
};

export function AgentHooksTab({ agentId }: AgentHooksTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createEvent, setCreateEvent] = useState('');
  const [createFunction, setCreateFunction] = useState('');
  const [createImage, setCreateImage] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createResources, setCreateResources] = useState<ComputeResources | undefined>(undefined);
  const [createEventError, setCreateEventError] = useState('');
  const [createFunctionError, setCreateFunctionError] = useState('');
  const [createImageError, setCreateImageError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editHookId, setEditHookId] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState('');
  const [editFunction, setEditFunction] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editResources, setEditResources] = useState<ComputeResources | undefined>(undefined);
  const [editEventError, setEditEventError] = useState('');
  const [editFunctionError, setEditFunctionError] = useState('');
  const [editImageError, setEditImageError] = useState('');
  const [envTargetId, setEnvTargetId] = useState<string | null>(null);
  const [initTargetId, setInitTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const hooksQuery = useQuery({
    queryKey: ['hooks', agentId, 'list'],
    queryFn: () => agentsClient.listHooks({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const hooks = hooksQuery.data?.hooks ?? [];

  const createHookMutation = useMutation({
    mutationFn: (payload: {
      agentId: string;
      event: string;
      function: string;
      image: string;
      description: string;
      resources?: ComputeResources;
    }) => agentsClient.createHook(payload),
    onSuccess: () => {
      toast.success('Hook created.');
      void queryClient.invalidateQueries({ queryKey: ['hooks', agentId, 'list'] });
      setCreateOpen(false);
      setCreateEvent('');
      setCreateFunction('');
      setCreateImage('');
      setCreateDescription('');
      setCreateResources(undefined);
      setCreateEventError('');
      setCreateFunctionError('');
      setCreateImageError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create hook.');
    },
  });

  const updateHookMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      event?: string;
      function?: string;
      image?: string;
      description?: string;
      resources?: ComputeResources;
    }) => agentsClient.updateHook(payload),
    onSuccess: () => {
      toast.success('Hook updated.');
      void queryClient.invalidateQueries({ queryKey: ['hooks', agentId, 'list'] });
      setEditOpen(false);
      setEditHookId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update hook.');
    },
  });

  const deleteHookMutation = useMutation({
    mutationFn: (hookId: string) => agentsClient.deleteHook({ id: hookId }),
    onSuccess: () => {
      toast.success('Hook deleted.');
      void queryClient.invalidateQueries({ queryKey: ['hooks', agentId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete hook.');
    },
  });

  const handleCreate = () => {
    const trimmedEvent = createEvent.trim();
    const trimmedFunction = createFunction.trim();
    const trimmedImage = createImage.trim();
    if (!trimmedEvent) {
      setCreateEventError('Event is required.');
    }
    if (!trimmedFunction) {
      setCreateFunctionError('Function is required.');
    }
    if (!trimmedImage) {
      setCreateImageError('Image is required.');
    }
    if (!trimmedEvent || !trimmedFunction || !trimmedImage) return;
    createHookMutation.mutate({
      agentId,
      event: trimmedEvent,
      function: trimmedFunction,
      image: trimmedImage,
      description: createDescription.trim(),
      resources: createResources,
    });
  };

  const handleEditOpen = (hook: Hook) => {
    const hookId = hook.meta?.id;
    if (!hookId) {
      toast.error('Missing hook ID.');
      return;
    }
    setEditHookId(hookId);
    setEditEvent(hook.event);
    setEditFunction(hook.function);
    setEditImage(hook.image);
    setEditDescription(hook.description);
    setEditResources(hook.resources ?? undefined);
    setEditEventError('');
    setEditFunctionError('');
    setEditImageError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedEvent = editEvent.trim();
    const trimmedFunction = editFunction.trim();
    const trimmedImage = editImage.trim();
    if (!trimmedEvent) {
      setEditEventError('Event is required.');
    }
    if (!trimmedFunction) {
      setEditFunctionError('Function is required.');
    }
    if (!trimmedImage) {
      setEditImageError('Image is required.');
    }
    if (!trimmedEvent || !trimmedFunction || !trimmedImage) return;
    if (!editHookId) {
      toast.error('Missing hook ID.');
      return;
    }
    updateHookMutation.mutate({
      id: editHookId,
      event: trimmedEvent,
      function: trimmedFunction,
      image: trimmedImage,
      description: editDescription.trim(),
      resources: editResources,
    });
  };

  const handleEnvOpen = (hook: Hook) => {
    const hookId = hook.meta?.id;
    if (!hookId) {
      toast.error('Missing hook ID.');
      return;
    }
    setEnvTargetId(hookId);
  };

  const handleInitOpen = (hook: Hook) => {
    const hookId = hook.meta?.id;
    if (!hookId) {
      toast.error('Missing hook ID.');
      return;
    }
    setInitTargetId(hookId);
  };

  const handleDeleteOpen = (hook: Hook) => {
    const hookId = hook.meta?.id;
    if (!hookId) {
      toast.error('Missing hook ID.');
      return;
    }
    setDeleteTargetId(hookId);
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditHookId(null);
      setEditEvent('');
      setEditFunction('');
      setEditImage('');
      setEditDescription('');
      setEditResources(undefined);
      setEditEventError('');
      setEditFunctionError('');
      setEditImageError('');
    }
  };

  const handleEnvOpenChange = (open: boolean) => {
    if (!open) {
      setEnvTargetId(null);
    }
  };

  const handleInitOpenChange = (open: boolean) => {
    if (!open) {
      setInitTargetId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="agent-hooks-heading">
            Hooks
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Event-driven execution hooks.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-hooks-create">
          Create hook
        </Button>
      </div>
      {hooksQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading hooks...</div> : null}
      {hooksQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load hooks.</div> : null}
      {hooks.length === 0 && !hooksQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-hooks-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">No hooks configured.</CardContent>
        </Card>
      ) : null}
      {hooks.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-hooks-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[1fr_1fr_1fr_1fr_120px]"
              data-testid="agent-hooks-header"
            >
              <span>Event</span>
              <span>Function</span>
              <span>Image</span>
              <span>Created</span>
              <span className="text-right">Manage</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {hooks.map((hook) => (
                <div
                  key={hook.meta?.id ?? hook.event}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[1fr_1fr_1fr_1fr_120px]"
                  data-testid="agent-hook-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-hook-event">
                      {hook.event}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="agent-hook-description">
                      {hook.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-hook-function">
                    {truncate(hook.function)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-hook-image">
                    {hook.image || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-hook-created">
                    {formatDateOnly(hook.meta?.createdAt)}
                  </span>
                  <div className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="agent-hook-manage">
                          Manage
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" data-testid="agent-hook-manage-menu">
                        <DropdownMenuItem onSelect={() => handleEditOpen(hook)} data-testid="agent-hook-edit">
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleEnvOpen(hook)} data-testid="agent-hook-envs">
                          Environment Variables
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleInitOpen(hook)} data-testid="agent-hook-init-scripts">
                          Init Scripts
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDeleteOpen(hook)} data-testid="agent-hook-delete">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="agent-hooks-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-hooks-create-title">Create hook</DialogTitle>
            <DialogDescription data-testid="agent-hooks-create-description">
              Configure a new event hook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Event"
              value={createEvent}
              onChange={(event) => {
                setCreateEvent(event.target.value);
                if (createEventError) setCreateEventError('');
              }}
              error={createEventError}
              data-testid="agent-hooks-create-event"
            />
            <Input
              label="Function"
              value={createFunction}
              onChange={(event) => {
                setCreateFunction(event.target.value);
                if (createFunctionError) setCreateFunctionError('');
              }}
              error={createFunctionError}
              data-testid="agent-hooks-create-function"
            />
            <Input
              label="Image"
              value={createImage}
              onChange={(event) => {
                setCreateImage(event.target.value);
                if (createImageError) setCreateImageError('');
              }}
              error={createImageError}
              data-testid="agent-hooks-create-image"
            />
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="agent-hooks-create-description-input"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Compute Resources</div>
              <ComputeResourcesEditor
                value={createResources}
                onChange={setCreateResources}
                testIdPrefix="agent-hooks-create"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-hooks-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={createHookMutation.isPending}
              data-testid="agent-hooks-create-submit"
            >
              {createHookMutation.isPending ? 'Creating...' : 'Create hook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-hooks-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-hooks-edit-title">Edit hook</DialogTitle>
            <DialogDescription data-testid="agent-hooks-edit-description">
              Update hook settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Event"
              value={editEvent}
              onChange={(event) => {
                setEditEvent(event.target.value);
                if (editEventError) setEditEventError('');
              }}
              error={editEventError}
              data-testid="agent-hooks-edit-event"
            />
            <Input
              label="Function"
              value={editFunction}
              onChange={(event) => {
                setEditFunction(event.target.value);
                if (editFunctionError) setEditFunctionError('');
              }}
              error={editFunctionError}
              data-testid="agent-hooks-edit-function"
            />
            <Input
              label="Image"
              value={editImage}
              onChange={(event) => {
                setEditImage(event.target.value);
                if (editImageError) setEditImageError('');
              }}
              error={editImageError}
              data-testid="agent-hooks-edit-image"
            />
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="agent-hooks-edit-description-input"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Compute Resources</div>
              <ComputeResourcesEditor value={editResources} onChange={setEditResources} testIdPrefix="agent-hooks-edit" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-hooks-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSave}
              disabled={updateHookMutation.isPending}
              data-testid="agent-hooks-edit-submit"
            >
              {updateHookMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NestedEnvsDialog
        targetCase="hookId"
        targetId={envTargetId}
        open={Boolean(envTargetId)}
        onOpenChange={handleEnvOpenChange}
        title="Environment Variables"
        description="Manage hook-specific environment variables."
      />

      <NestedInitScriptsDialog
        targetCase="hookId"
        targetId={initTargetId}
        open={Boolean(initTargetId)}
        onOpenChange={handleInitOpenChange}
        title="Init Scripts"
        description="Manage hook init scripts."
      />

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete hook"
        description="This action permanently removes the hook."
        confirmLabel="Delete hook"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteHookMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteHookMutation.isPending}
      />
    </div>
  );
}
