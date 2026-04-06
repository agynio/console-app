import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ComputeResourcesEditor } from '@/components/ComputeResourcesEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { ComputeResources, Mcp } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly, truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { NestedEnvsDialog } from '@/pages/agent-detail/NestedEnvsDialog';
import { NestedInitScriptsDialog } from '@/pages/agent-detail/NestedInitScriptsDialog';
import { toast } from 'sonner';

type AgentMcpsTabProps = {
  agentId: string;
};

export function AgentMcpsTab({ agentId }: AgentMcpsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createImage, setCreateImage] = useState('');
  const [createCommand, setCreateCommand] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createResources, setCreateResources] = useState<ComputeResources | undefined>(undefined);
  const [createNameError, setCreateNameError] = useState('');
  const [createImageError, setCreateImageError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editMcpId, setEditMcpId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editResources, setEditResources] = useState<ComputeResources | undefined>(undefined);
  const [editImageError, setEditImageError] = useState('');
  const [envTargetId, setEnvTargetId] = useState<string | null>(null);
  const [initTargetId, setInitTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const mcpsQuery = useQuery({
    queryKey: ['mcps', agentId, 'list'],
    queryFn: () => agentsClient.listMcps({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const mcps = mcpsQuery.data?.mcps ?? [];

  const createMcpMutation = useMutation({
    mutationFn: (payload: {
      agentId: string;
      name: string;
      image: string;
      command: string;
      description: string;
      resources?: ComputeResources;
    }) => agentsClient.createMcp(payload),
    onSuccess: () => {
      toast.success('MCP created.');
      void queryClient.invalidateQueries({ queryKey: ['mcps', agentId, 'list'] });
      setCreateOpen(false);
      setCreateName('');
      setCreateImage('');
      setCreateCommand('');
      setCreateDescription('');
      setCreateResources(undefined);
      setCreateNameError('');
      setCreateImageError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create MCP.');
    },
  });

  const updateMcpMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      image?: string;
      command?: string;
      description?: string;
      resources?: ComputeResources;
    }) => agentsClient.updateMcp(payload),
    onSuccess: () => {
      toast.success('MCP updated.');
      void queryClient.invalidateQueries({ queryKey: ['mcps', agentId, 'list'] });
      setEditOpen(false);
      setEditMcpId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update MCP.');
    },
  });

  const deleteMcpMutation = useMutation({
    mutationFn: (mcpId: string) => agentsClient.deleteMcp({ id: mcpId }),
    onSuccess: () => {
      toast.success('MCP deleted.');
      void queryClient.invalidateQueries({ queryKey: ['mcps', agentId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete MCP.');
    },
  });

  const handleCreate = () => {
    const trimmedName = createName.trim();
    const trimmedImage = createImage.trim();
    if (!trimmedName) {
      setCreateNameError('Name is required.');
    }
    if (!trimmedImage) {
      setCreateImageError('Image is required.');
    }
    if (!trimmedName || !trimmedImage) return;
    createMcpMutation.mutate({
      agentId,
      name: trimmedName,
      image: trimmedImage,
      command: createCommand.trim(),
      description: createDescription.trim(),
      resources: createResources,
    });
  };

  const handleEditOpen = (mcp: Mcp) => {
    const mcpId = mcp.meta?.id;
    if (!mcpId) {
      toast.error('Missing MCP ID.');
      return;
    }
    setEditMcpId(mcpId);
    setEditName(mcp.name);
    setEditImage(mcp.image);
    setEditCommand(mcp.command);
    setEditDescription(mcp.description);
    setEditResources(mcp.resources ?? undefined);
    setEditImageError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedImage = editImage.trim();
    if (!trimmedImage) {
      setEditImageError('Image is required.');
      return;
    }
    if (!editMcpId) {
      toast.error('Missing MCP ID.');
      return;
    }
    updateMcpMutation.mutate({
      id: editMcpId,
      image: trimmedImage,
      command: editCommand.trim(),
      description: editDescription.trim(),
      resources: editResources,
    });
  };

  const handleEnvOpen = (mcp: Mcp) => {
    const mcpId = mcp.meta?.id;
    if (!mcpId) {
      toast.error('Missing MCP ID.');
      return;
    }
    setEnvTargetId(mcpId);
  };

  const handleInitOpen = (mcp: Mcp) => {
    const mcpId = mcp.meta?.id;
    if (!mcpId) {
      toast.error('Missing MCP ID.');
      return;
    }
    setInitTargetId(mcpId);
  };

  const handleDeleteOpen = (mcp: Mcp) => {
    const mcpId = mcp.meta?.id;
    if (!mcpId) {
      toast.error('Missing MCP ID.');
      return;
    }
    setDeleteTargetId(mcpId);
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditMcpId(null);
      setEditName('');
      setEditImage('');
      setEditCommand('');
      setEditDescription('');
      setEditResources(undefined);
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
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-mcps-heading">
            MCPs
          </h3>
          <p className="text-sm text-muted-foreground">Model context providers for this agent.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-mcps-create">
          Create MCP
        </Button>
      </div>
      {mcpsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading MCPs...</div> : null}
      {mcpsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load MCPs.</div> : null}
      {mcps.length === 0 && !mcpsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-mcps-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No MCPs configured.</CardContent>
        </Card>
      ) : null}
      {mcps.length > 0 ? (
        <Card className="border-border" data-testid="agent-mcps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1fr_1fr_2fr_1fr_120px]"
              data-testid="agent-mcps-header"
            >
              <span>Name</span>
              <span>Image</span>
              <span>Command</span>
              <span>Created</span>
              <span className="text-right">Manage</span>
            </div>
            <div className="divide-y divide-border">
              {mcps.map((mcp) => (
                <div
                  key={mcp.meta?.id ?? mcp.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1fr_1fr_2fr_1fr_120px]"
                  data-testid="agent-mcp-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-mcp-name">
                      {mcp.name}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="agent-mcp-description">
                      {mcp.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground" data-testid="agent-mcp-image">
                    {mcp.image || '—'}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="agent-mcp-command">
                    {truncate(mcp.command)}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="agent-mcp-created">
                    {formatDateOnly(mcp.meta?.createdAt)}
                  </span>
                  <div className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="agent-mcp-manage">
                          Manage
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" data-testid="agent-mcp-manage-menu">
                        <DropdownMenuItem onSelect={() => handleEditOpen(mcp)} data-testid="agent-mcp-edit">
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleEnvOpen(mcp)} data-testid="agent-mcp-envs">
                          Environment Variables
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleInitOpen(mcp)} data-testid="agent-mcp-init-scripts">
                          Init Scripts
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleDeleteOpen(mcp)} data-testid="agent-mcp-delete">
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
        <DialogContent data-testid="agent-mcps-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-mcps-create-title">Create MCP</DialogTitle>
            <DialogDescription data-testid="agent-mcps-create-description">
              Configure a new model context provider.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-create-name">Name</Label>
              <Input
                id="agent-mcps-create-name"
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  if (createNameError) setCreateNameError('');
                }}
                data-testid="agent-mcps-create-name"
              />
              {createNameError && <p className="text-sm text-destructive">{createNameError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-create-image">Image</Label>
              <Input
                id="agent-mcps-create-image"
                value={createImage}
                onChange={(event) => {
                  setCreateImage(event.target.value);
                  if (createImageError) setCreateImageError('');
                }}
                data-testid="agent-mcps-create-image"
              />
              {createImageError && <p className="text-sm text-destructive">{createImageError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-create-command">Command</Label>
              <Input
                id="agent-mcps-create-command"
                value={createCommand}
                onChange={(event) => setCreateCommand(event.target.value)}
                data-testid="agent-mcps-create-command"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-create-description-input">Description</Label>
              <Input
                id="agent-mcps-create-description-input"
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                data-testid="agent-mcps-create-description-input"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-foreground">Compute Resources</div>
              <ComputeResourcesEditor
                value={createResources}
                onChange={setCreateResources}
                testIdPrefix="agent-mcps-create"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-mcps-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMcpMutation.isPending}
              data-testid="agent-mcps-create-submit"
            >
              {createMcpMutation.isPending ? 'Creating...' : 'Create MCP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-mcps-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-mcps-edit-title">Edit MCP</DialogTitle>
            <DialogDescription data-testid="agent-mcps-edit-description">
              Update MCP settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-edit-name">Name</Label>
              <Input id="agent-mcps-edit-name" value={editName} disabled data-testid="agent-mcps-edit-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-edit-image">Image</Label>
              <Input
                id="agent-mcps-edit-image"
                value={editImage}
                onChange={(event) => {
                  setEditImage(event.target.value);
                  if (editImageError) setEditImageError('');
                }}
                data-testid="agent-mcps-edit-image"
              />
              {editImageError && <p className="text-sm text-destructive">{editImageError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-edit-command">Command</Label>
              <Input
                id="agent-mcps-edit-command"
                value={editCommand}
                onChange={(event) => setEditCommand(event.target.value)}
                data-testid="agent-mcps-edit-command"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-mcps-edit-description-input">Description</Label>
              <Input
                id="agent-mcps-edit-description-input"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                data-testid="agent-mcps-edit-description-input"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-foreground">Compute Resources</div>
              <ComputeResourcesEditor
                value={editResources}
                onChange={setEditResources}
                testIdPrefix="agent-mcps-edit"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-mcps-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleEditSave}
              disabled={updateMcpMutation.isPending}
              data-testid="agent-mcps-edit-submit"
            >
              {updateMcpMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NestedEnvsDialog
        targetCase="mcpId"
        targetId={envTargetId}
        open={Boolean(envTargetId)}
        onOpenChange={handleEnvOpenChange}
        title="Environment Variables"
        description="Manage MCP-specific environment variables."
      />

      <NestedInitScriptsDialog
        targetCase="mcpId"
        targetId={initTargetId}
        open={Boolean(initTargetId)}
        onOpenChange={handleInitOpenChange}
        title="Init Scripts"
        description="Manage MCP init scripts."
      />

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete MCP"
        description="This action permanently removes the MCP."
        confirmLabel="Delete MCP"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteMcpMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteMcpMutation.isPending}
      />
    </div>
  );
}
