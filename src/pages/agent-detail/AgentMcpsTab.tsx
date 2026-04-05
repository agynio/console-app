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
import type { ComputeResources, Env, InitScript, Mcp } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentMcpsTabProps = {
  agentId: string;
};

const truncate = (value: string, maxLength = 100) => {
  if (!value) return '—';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
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
  const [editMcpId, setEditMcpId] = useState('');
  const [editName, setEditName] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editResources, setEditResources] = useState<ComputeResources | undefined>(undefined);
  const [editImageError, setEditImageError] = useState('');
  const [envTargetId, setEnvTargetId] = useState('');
  const [envName, setEnvName] = useState('');
  const [envValue, setEnvValue] = useState('');
  const [envDescription, setEnvDescription] = useState('');
  const [envNameError, setEnvNameError] = useState('');
  const [envValueError, setEnvValueError] = useState('');
  const [initTargetId, setInitTargetId] = useState('');
  const [initScript, setInitScript] = useState('');
  const [initDescription, setInitDescription] = useState('');
  const [initScriptError, setInitScriptError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState('');

  const mcpsQuery = useQuery({
    queryKey: ['mcps', agentId, 'list'],
    queryFn: () => agentsClient.listMcps({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const mcps = mcpsQuery.data?.mcps ?? [];

  const envsQuery = useQuery({
    queryKey: ['envs', 'mcp', envTargetId, 'list'],
    queryFn: () => agentsClient.listEnvs({ mcpId: envTargetId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(envTargetId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const initScriptsQuery = useQuery({
    queryKey: ['initScripts', 'mcp', initTargetId, 'list'],
    queryFn: () => agentsClient.listInitScripts({ mcpId: initTargetId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(initTargetId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

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
      setEditMcpId('');
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
      setDeleteTargetId('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete MCP.');
    },
  });

  const createEnvMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      target: { case: 'mcpId'; value: string };
      source: { case: 'value'; value: string };
    }) => agentsClient.createEnv(payload),
    onSuccess: () => {
      toast.success('Environment variable added.');
      if (envTargetId) {
        void queryClient.invalidateQueries({ queryKey: ['envs', 'mcp', envTargetId, 'list'] });
      }
      setEnvName('');
      setEnvValue('');
      setEnvDescription('');
      setEnvNameError('');
      setEnvValueError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add environment variable.');
    },
  });

  const deleteEnvMutation = useMutation({
    mutationFn: (envId: string) => agentsClient.deleteEnv({ id: envId }),
    onSuccess: () => {
      toast.success('Environment variable removed.');
      if (envTargetId) {
        void queryClient.invalidateQueries({ queryKey: ['envs', 'mcp', envTargetId, 'list'] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete environment variable.');
    },
  });

  const createInitScriptMutation = useMutation({
    mutationFn: (payload: { script: string; description: string; target: { case: 'mcpId'; value: string } }) =>
      agentsClient.createInitScript(payload),
    onSuccess: () => {
      toast.success('Init script added.');
      if (initTargetId) {
        void queryClient.invalidateQueries({ queryKey: ['initScripts', 'mcp', initTargetId, 'list'] });
      }
      setInitScript('');
      setInitDescription('');
      setInitScriptError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add init script.');
    },
  });

  const deleteInitScriptMutation = useMutation({
    mutationFn: (initId: string) => agentsClient.deleteInitScript({ id: initId }),
    onSuccess: () => {
      toast.success('Init script removed.');
      if (initTargetId) {
        void queryClient.invalidateQueries({ queryKey: ['initScripts', 'mcp', initTargetId, 'list'] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete init script.');
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
    setEditMcpId(mcp.meta?.id ?? '');
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

  const handleEnvCreate = () => {
    const trimmedName = envName.trim();
    const trimmedValue = envValue.trim();
    if (!trimmedName) {
      setEnvNameError('Name is required.');
    }
    if (!trimmedValue) {
      setEnvValueError('Value is required.');
    }
    if (!trimmedName || !trimmedValue || !envTargetId) return;
    createEnvMutation.mutate({
      name: trimmedName,
      description: envDescription.trim(),
      target: { case: 'mcpId', value: envTargetId },
      source: { case: 'value', value: trimmedValue },
    });
  };

  const handleInitCreate = () => {
    const trimmedScript = initScript.trim();
    if (!trimmedScript) {
      setInitScriptError('Script is required.');
      return;
    }
    if (!initTargetId) return;
    createInitScriptMutation.mutate({
      script: trimmedScript,
      description: initDescription.trim(),
      target: { case: 'mcpId', value: initTargetId },
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditMcpId('');
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
      setEnvTargetId('');
      setEnvName('');
      setEnvValue('');
      setEnvDescription('');
      setEnvNameError('');
      setEnvValueError('');
    }
  };

  const handleInitOpenChange = (open: boolean) => {
    if (!open) {
      setInitTargetId('');
      setInitScript('');
      setInitDescription('');
      setInitScriptError('');
    }
  };

  const envs = envsQuery.data?.envs ?? [];
  const initScripts = initScriptsQuery.data?.initScripts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="agent-mcps-heading">
            MCPs
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Model context providers for this agent.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-mcps-create">
          Create MCP
        </Button>
      </div>
      {mcpsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading MCPs...</div> : null}
      {mcpsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load MCPs.</div> : null}
      {mcps.length === 0 && !mcpsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-mcps-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">No MCPs configured.</CardContent>
        </Card>
      ) : null}
      {mcps.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-mcps-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[1fr_1fr_2fr_1fr_120px]"
              data-testid="agent-mcps-header"
            >
              <span>Name</span>
              <span>Image</span>
              <span>Command</span>
              <span>Created</span>
              <span className="text-right">Manage</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {mcps.map((mcp) => (
                <div
                  key={mcp.meta?.id ?? mcp.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[1fr_1fr_2fr_1fr_120px]"
                  data-testid="agent-mcp-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-mcp-name">
                      {mcp.name}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="agent-mcp-description">
                      {mcp.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-mcp-image">
                    {mcp.image || '—'}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-mcp-command">
                    {truncate(mcp.command)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-mcp-created">
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
                        <DropdownMenuItem
                          onSelect={() => setEnvTargetId(mcp.meta?.id ?? '')}
                          data-testid="agent-mcp-envs"
                        >
                          Environment Variables
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setInitTargetId(mcp.meta?.id ?? '')}
                          data-testid="agent-mcp-init-scripts"
                        >
                          Init Scripts
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setDeleteTargetId(mcp.meta?.id ?? '')}
                          data-testid="agent-mcp-delete"
                        >
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
            <Input
              label="Name"
              value={createName}
              onChange={(event) => {
                setCreateName(event.target.value);
                if (createNameError) setCreateNameError('');
              }}
              error={createNameError}
              data-testid="agent-mcps-create-name"
            />
            <Input
              label="Image"
              value={createImage}
              onChange={(event) => {
                setCreateImage(event.target.value);
                if (createImageError) setCreateImageError('');
              }}
              error={createImageError}
              data-testid="agent-mcps-create-image"
            />
            <Input
              label="Command"
              value={createCommand}
              onChange={(event) => setCreateCommand(event.target.value)}
              data-testid="agent-mcps-create-command"
            />
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="agent-mcps-create-description-input"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Compute Resources</div>
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
              variant="primary"
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
            <Input label="Name" value={editName} disabled data-testid="agent-mcps-edit-name" />
            <Input
              label="Image"
              value={editImage}
              onChange={(event) => {
                setEditImage(event.target.value);
                if (editImageError) setEditImageError('');
              }}
              error={editImageError}
              data-testid="agent-mcps-edit-image"
            />
            <Input
              label="Command"
              value={editCommand}
              onChange={(event) => setEditCommand(event.target.value)}
              data-testid="agent-mcps-edit-command"
            />
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="agent-mcps-edit-description-input"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Compute Resources</div>
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
              variant="primary"
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

      <Dialog open={Boolean(envTargetId)} onOpenChange={handleEnvOpenChange}>
        <DialogContent data-testid="agent-mcps-envs-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-mcps-envs-title">Environment Variables</DialogTitle>
            <DialogDescription data-testid="agent-mcps-envs-description">
              Manage MCP-specific environment variables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                label="Name"
                value={envName}
                onChange={(event) => {
                  setEnvName(event.target.value);
                  if (envNameError) setEnvNameError('');
                }}
                error={envNameError}
                data-testid="agent-mcps-envs-name"
              />
              <Input
                label="Value"
                value={envValue}
                onChange={(event) => {
                  setEnvValue(event.target.value);
                  if (envValueError) setEnvValueError('');
                }}
                error={envValueError}
                data-testid="agent-mcps-envs-value"
              />
              <Input
                label="Description"
                value={envDescription}
                onChange={(event) => setEnvDescription(event.target.value)}
                data-testid="agent-mcps-envs-description-input"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnvCreate}
                disabled={createEnvMutation.isPending}
                data-testid="agent-mcps-envs-add"
              >
                {createEnvMutation.isPending ? 'Adding...' : 'Add ENV'}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--agyn-dark)]">Existing ENVs</div>
              {envsQuery.isPending ? (
                <div className="text-xs text-[var(--agyn-gray)]">Loading envs...</div>
              ) : null}
              {envsQuery.isError ? (
                <div className="text-xs text-[var(--agyn-gray)]">Failed to load envs.</div>
              ) : null}
              {envs.length === 0 && !envsQuery.isPending ? (
                <div className="text-xs text-[var(--agyn-gray)]">No envs configured.</div>
              ) : null}
              {envs.length > 0 ? (
                <div className="divide-y divide-[var(--agyn-border-subtle)] rounded-md border border-[var(--agyn-border-subtle)]">
                  {envs.map((env: Env) => (
                    <div key={env.meta?.id ?? env.name} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <div className="text-sm text-[var(--agyn-dark)]">{env.name}</div>
                        <div className="text-xs text-[var(--agyn-gray)]">{env.description || '—'}</div>
                        <div className="text-xs text-[var(--agyn-gray)]">
                          {env.source.case === 'value'
                            ? env.source.value
                            : env.source.case === 'secretId'
                            ? `secret: ${env.source.value}`
                            : '—'}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteEnvMutation.mutate(env.meta?.id ?? '')}
                        disabled={deleteEnvMutation.isPending}
                        data-testid="agent-mcps-envs-delete"
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
              <Button variant="outline" size="sm" data-testid="agent-mcps-envs-close">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(initTargetId)} onOpenChange={handleInitOpenChange}>
        <DialogContent data-testid="agent-mcps-init-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-mcps-init-title">Init Scripts</DialogTitle>
            <DialogDescription data-testid="agent-mcps-init-description">
              Manage MCP init scripts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-[var(--agyn-dark)]">Script</label>
              <textarea
                className={`
                  w-full min-h-[120px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
                  text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)] font-mono
                  focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
                  ${initScriptError ? 'border-red-500 focus:ring-red-500' : ''}
                `}
                value={initScript}
                onChange={(event) => {
                  setInitScript(event.target.value);
                  if (initScriptError) setInitScriptError('');
                }}
                data-testid="agent-mcps-init-script"
              />
              {initScriptError ? <p className="text-sm text-red-500">{initScriptError}</p> : null}
              <Input
                label="Description"
                value={initDescription}
                onChange={(event) => setInitDescription(event.target.value)}
                data-testid="agent-mcps-init-description-input"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleInitCreate}
                disabled={createInitScriptMutation.isPending}
                data-testid="agent-mcps-init-add"
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
                  {initScripts.map((script: InitScript) => (
                    <div key={script.meta?.id ?? script.script} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <div className="text-sm text-[var(--agyn-dark)]">{truncate(script.script)}</div>
                        <div className="text-xs text-[var(--agyn-gray)]">{script.description || '—'}</div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => deleteInitScriptMutation.mutate(script.meta?.id ?? '')}
                        disabled={deleteInitScriptMutation.isPending}
                        data-testid="agent-mcps-init-delete"
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
              <Button variant="outline" size="sm" data-testid="agent-mcps-init-close">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => setDeleteTargetId(open ? deleteTargetId : '')}
        title="Delete MCP"
        description="This action permanently removes the MCP."
        confirmLabel="Delete MCP"
        variant="danger"
        onConfirm={() => deleteMcpMutation.mutate(deleteTargetId)}
        isPending={deleteMcpMutation.isPending}
      />
    </div>
  );
}
