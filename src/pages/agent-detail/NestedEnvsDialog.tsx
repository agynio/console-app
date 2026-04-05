import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Env } from '@/gen/agynio/api/agents/v1/agents_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type NestedEnvsDialogProps = {
  targetCase: 'mcpId' | 'hookId';
  targetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
};

export function NestedEnvsDialog({
  targetCase,
  targetId,
  open,
  onOpenChange,
  title = 'Environment Variables',
  description = 'Manage environment variables.',
}: NestedEnvsDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [envDescription, setEnvDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [valueError, setValueError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setValue('');
    setEnvDescription('');
    setNameError('');
    setValueError('');
  }, [open, targetId]);

  const envsQuery = useQuery({
    queryKey: ['envs', targetCase, targetId, 'list'],
    queryFn: () => {
      if (!targetId) {
        return Promise.reject(new Error('Missing target ID.'));
      }
      return targetCase === 'mcpId'
        ? agentsClient.listEnvs({ mcpId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' })
        : agentsClient.listEnvs({ hookId: targetId, pageSize: MAX_PAGE_SIZE, pageToken: '' });
    },
    enabled: Boolean(targetId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const envs = envsQuery.data?.envs ?? [];

  const createEnvMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description: string;
      target: { case: 'mcpId'; value: string } | { case: 'hookId'; value: string };
      source: { case: 'value'; value: string };
    }) => agentsClient.createEnv(payload),
    onSuccess: () => {
      toast.success('Environment variable added.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['envs', targetCase, targetId, 'list'] });
      }
      setName('');
      setValue('');
      setEnvDescription('');
      setNameError('');
      setValueError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add environment variable.');
    },
  });

  const deleteEnvMutation = useMutation({
    mutationFn: (envId: string) => agentsClient.deleteEnv({ id: envId }),
    onSuccess: () => {
      toast.success('Environment variable removed.');
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: ['envs', targetCase, targetId, 'list'] });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete environment variable.');
    },
  });

  const handleCreate = () => {
    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
    }
    if (!trimmedValue) {
      setValueError('Value is required.');
    }
    if (!trimmedName || !trimmedValue) return;
    if (!targetId) {
      toast.error('Missing target ID.');
      return;
    }

    const target =
      targetCase === 'mcpId'
        ? ({ case: 'mcpId', value: targetId } as const)
        : ({ case: 'hookId', value: targetId } as const);

    createEnvMutation.mutate({
      name: trimmedName,
      description: envDescription.trim(),
      target,
      source: { case: 'value', value: trimmedValue },
    });
  };

  const handleDelete = (env: Env) => {
    const envId = env.meta?.id;
    if (!envId) {
      toast.error('Missing environment variable ID.');
      return;
    }
    deleteEnvMutation.mutate(envId);
  };

  const resolveSource = (env: Env) => {
    if (env.source.case === 'value') {
      return env.source.value;
    }
    if (env.source.case === 'secretId') {
      return `secret: ${env.source.value}`;
    }
    return '—';
  };

  const handleDialogChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent data-testid="nested-envs-dialog">
        <DialogHeader>
          <DialogTitle data-testid="nested-envs-title">{title}</DialogTitle>
          <DialogDescription data-testid="nested-envs-description">{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              label="Name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError('');
              }}
              error={nameError}
              data-testid="nested-envs-name"
            />
            <Input
              label="Value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (valueError) setValueError('');
              }}
              error={valueError}
              data-testid="nested-envs-value"
            />
            <Input
              label="Description"
              value={envDescription}
              onChange={(event) => setEnvDescription(event.target.value)}
              data-testid="nested-envs-description-input"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreate}
              disabled={createEnvMutation.isPending}
              data-testid="nested-envs-add"
            >
              {createEnvMutation.isPending ? 'Adding...' : 'Add ENV'}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--agyn-dark)]">Existing ENVs</div>
            {envsQuery.isPending ? <div className="text-xs text-[var(--agyn-gray)]">Loading envs...</div> : null}
            {envsQuery.isError ? <div className="text-xs text-[var(--agyn-gray)]">Failed to load envs.</div> : null}
            {envs.length === 0 && !envsQuery.isPending ? (
              <div className="text-xs text-[var(--agyn-gray)]">No envs configured.</div>
            ) : null}
            {envs.length > 0 ? (
              <div className="divide-y divide-[var(--agyn-border-subtle)] rounded-md border border-[var(--agyn-border-subtle)]">
                {envs.map((env) => (
                  <div key={env.meta?.id ?? env.name} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="text-sm text-[var(--agyn-dark)]">{env.name}</div>
                      <div className="text-xs text-[var(--agyn-gray)]">{env.description || '—'}</div>
                      <div className="text-xs text-[var(--agyn-gray)]">{resolveSource(env)}</div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(env)}
                      disabled={deleteEnvMutation.isPending}
                      data-testid="nested-envs-delete"
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
            <Button variant="outline" size="sm" data-testid="nested-envs-close">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
