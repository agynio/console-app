import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ConnectError } from '@connectrpc/connect';
import { agentsClient, imagesClient, runnersClient } from '@/api/client';
import { ChoiceCard } from '@/components/ChoiceCard';
import { Button } from '@/components/ui/button';
import { EnvironmentAvailability } from '@/gen/agynio/api/agents/v1/agents_pb';
import { ImageType } from '@/gen/agynio/api/images/v1/images_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { RUNTIMES, availableName, newestTag, resolveImage, resolveRunner, type Runtime } from './catalog';

type StepEnvironmentProps = {
  organizationId: string;
  runtime: Runtime;
  onRuntimeChange: (runtime: Runtime) => void;
  onDone: (values: { environmentId: string; environmentName: string }) => void;
};

const VOLUME_SIZE = '10Gi';

/**
 * Two facts and no more than one decision. The runtime is a choice; the workspace
 * is stated, because a picker holding one option claims to matter and then gives
 * the reader nothing to do.
 */
export function StepEnvironment({
  organizationId,
  runtime,
  onRuntimeChange,
  onDone,
}: StepEnvironmentProps) {
  const [error, setError] = useState('');
  // Held here rather than lifted: it exists only between a half-finished attempt
  // and the retry that completes it, and the step owns both.
  const [committedId, setCommittedId] = useState('');

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'setup'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
  });

  const runtimeImagesQuery = useQuery({
    queryKey: ['images', organizationId, 'setup', 'agent-runtime'],
    queryFn: () =>
      imagesClient.listImages({
        organizationId,
        type: ImageType.AGENT_RUNTIME,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(organizationId),
  });

  const workspaceImagesQuery = useQuery({
    queryKey: ['images', organizationId, 'setup', 'workspace'],
    queryFn: () =>
      imagesClient.listImages({
        organizationId,
        type: ImageType.WORKSPACE,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(organizationId),
  });

  const environmentsQuery = useQuery({
    queryKey: ['environments', organizationId, 'setup'],
    queryFn: () =>
      agentsClient.listEnvironments({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
  });

  const runner = useMemo(
    () => resolveRunner(runnersQuery.data?.runners ?? [], organizationId),
    [runnersQuery.data?.runners, organizationId],
  );

  const workspaceImage = useMemo(() => {
    const images = workspaceImagesQuery.data?.images ?? [];
    return images.find((image) => image.organizationId === organizationId) ?? images[0];
  }, [workspaceImagesQuery.data?.images, organizationId]);

  const runtimeImage = useMemo(() => {
    const name = RUNTIMES.find((entry) => entry.id === runtime)?.imageName ?? '';
    return resolveImage(runtimeImagesQuery.data?.images ?? [], name, organizationId);
  }, [runtimeImagesQuery.data?.images, runtime, organizationId]);

  // Opening the picker is what refreshes an image elsewhere; here nothing is
  // picked, so the wizard asks for the same refresh itself.
  const workspaceVersions = useQuery({
    queryKey: ['image-versions', workspaceImage?.meta?.id ?? ''],
    queryFn: () => imagesClient.refreshImage({ imageId: workspaceImage?.meta?.id ?? '' }),
    enabled: Boolean(workspaceImage?.meta?.id),
    staleTime: 30_000,
  });

  const runtimeVersions = useQuery({
    queryKey: ['image-versions', runtimeImage?.meta?.id ?? ''],
    queryFn: () => imagesClient.refreshImage({ imageId: runtimeImage?.meta?.id ?? '' }),
    enabled: Boolean(runtimeImage?.meta?.id),
    staleTime: 30_000,
  });

  // Resolved up here rather than inside the write, so the step can show what it
  // is about to commit. A wizard that hides its own output cannot be reviewed,
  // and an image reference is exactly the thing worth reading before you agree
  // to it.
  const workspaceTag = newestTag(workspaceVersions.data?.versions ?? []);
  const runtimeTag = newestTag(runtimeVersions.data?.versions ?? []);
  const environmentName = useMemo(
    () =>
      availableName(
        (environmentsQuery.data?.environments ?? []).map((environment) => environment.name),
        'default',
      ),
    [environmentsQuery.data?.environments],
  );

  const create = useMutation({
    mutationFn: async () => {
      const name = environmentName;

      // Reuse the environment a failed attempt already committed rather than
      // leaving it behind and creating a second one.
      let id = committedId;
      let createdName = name;
      if (!id) {
        const created = await agentsClient.createEnvironment({
          organizationId,
          name,
          runnerId: runner?.meta?.id ?? '',
          workspaceImageId: workspaceImage?.meta?.id ?? '',
          workspaceImageTag: workspaceTag,
          agentRuntimeImageId: runtimeImage?.meta?.id ?? '',
          agentRuntimeImageTag: runtimeTag,
          availability: EnvironmentAvailability.INTERNAL,
        });
        id = created.environment?.meta?.id ?? '';
        createdName = created.environment?.name ?? name;
        if (!id) throw new Error('Environment created but missing ID.');
        setCommittedId(id);
      }

      // The wizard's own curation, not a platform default: both things this run
      // can produce are worse without somewhere to keep what they write.
      await agentsClient.createVolume({
        target: { case: 'environmentId', value: id },
        name: 'workspace',
        mountPath: '/workspace',
        persistent: true,
        size: VOLUME_SIZE,
      });

      return { environmentId: id, environmentName: createdName };
    },
    onSuccess: (values) => onDone(values),
    onError: (cause) => {
      setError(cause instanceof ConnectError ? cause.message : 'Could not create the environment.');
    },
  });

  const loading =
    runnersQuery.isPending ||
    runtimeImagesQuery.isPending ||
    workspaceImagesQuery.isPending ||
    environmentsQuery.isPending;

  const blocker = loading
    ? ''
    : !runner
      ? 'No runner is available to this organization yet. Register one under Runtime → Runners.'
      : !workspaceImage
        ? 'No workspace image is available. Register one under Runtime → Images.'
        : !runtimeImage
          ? `No ${runtime === 'claude' ? 'Claude Code' : 'Codex'} runtime image is available. Register one under Runtime → Images.`
          : '';

  const imageRef = (name: string | undefined, tag: string) =>
    name ? (tag ? `${name}:${tag}` : name) : '…';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Where your work runs</h2>
        <p className="text-sm text-muted-foreground">
          Pick a CLI. Everything else is set up for you.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          {RUNTIMES.map((option) => (
            <ChoiceCard
              key={option.id}
              title={option.label}
              description={option.description}
              selected={runtime === option.id}
              onSelect={() => onRuntimeChange(option.id)}
              disabled={create.isPending}
              data-testid={`setup-runtime-${option.id}`}
            />
          ))}
        </div>

        {/* What the button is about to commit, in the terms the Console will
            show it in afterwards. The tags are the part worth reading. */}
        <dl
          className="space-y-0 rounded-lg border border-border bg-card p-4 text-sm"
          data-testid="setup-environment-summary"
        >
          <div className="flex items-baseline justify-between gap-3 pb-2">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="text-foreground">{environmentName}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border py-2">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="truncate font-mono text-xs text-foreground" title={imageRef(workspaceImage?.name, workspaceTag)}>
              {imageRef(workspaceImage?.name, workspaceTag)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border py-2">
            <dt className="text-muted-foreground">Runtime</dt>
            <dd className="truncate font-mono text-xs text-foreground" title={imageRef(runtimeImage?.name, runtimeTag)}>
              {imageRef(runtimeImage?.name, runtimeTag)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border py-2">
            <dt className="text-muted-foreground">Runner</dt>
            <dd className="text-foreground">{runner?.name ?? '…'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
            <dt className="text-muted-foreground">Storage</dt>
            <dd className="text-right text-foreground">
              /workspace, {VOLUME_SIZE}
              <span className="block text-xs text-muted-foreground">
                persistent — survives a restart
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {blocker ? (
        <p className="text-sm text-destructive" data-testid="setup-environment-blocked">
          {blocker}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" data-testid="setup-environment-error">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button
          onClick={() => {
            setError('');
            create.mutate();
          }}
          disabled={loading || Boolean(blocker) || create.isPending}
          data-testid="setup-environment-submit"
        >
          {create.isPending ? 'Creating…' : 'Create environment'}
        </Button>
        <span className="text-sm text-muted-foreground">Editable afterwards under Runtime</span>
      </div>
    </div>
  );
}
