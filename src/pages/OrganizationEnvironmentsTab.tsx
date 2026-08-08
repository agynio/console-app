import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient, runnersClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { SortableHeader } from '@/components/SortableHeader';
import { ComboboxInput, type ComboboxOption } from '@/components/ComboboxInput';
import { ImageSelector } from '@/components/ImageSelector';
import { ImageType } from '@/gen/agynio/api/images/v1/images_pb';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Environment } from '@/gen/agynio/api/agents/v1/agents_pb';
import { EnvironmentAvailability } from '@/gen/agynio/api/agents/v1/agents_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useImageRef } from '@/hooks/useImageRef';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type EnvironmentValues = {
  name: string;
  availability: EnvironmentAvailability;
  runnerId: string;
  flavor: string;
  workspaceImageId: string;
  workspaceImageTag: string;
  // Empty makes a workspace-only environment: usable by a sandbox, rejected
  // when creating an agent.
  agentRuntimeImageId: string;
  agentRuntimeImageTag: string;
};

type EnvironmentFieldErrors = Partial<
  Record<'name' | 'runnerId' | 'workspaceImageId' | 'workspaceImageTag', string>
>;

type RunnerOption = {
  value: string;
  label: string;
};

type EnvironmentDialogProps = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  pendingLabel: string;
  initialValues: EnvironmentValues;
  runnerOptions: RunnerOption[];
  // Keyed by runner: a flavor name only means anything against the runner that
  // reported it, so the list has to follow the runner chosen in this dialog.
  flavorsByRunner: Map<string, ComboboxOption[]>;
  isSubmitting: boolean;
  onSubmit: (values: EnvironmentValues) => void;
  testIdPrefix: string;
};

const emptyEnvironmentValues: EnvironmentValues = {
  name: '',
  availability: EnvironmentAvailability.INTERNAL,
  runnerId: '',
  flavor: '',
  workspaceImageId: '',
  workspaceImageTag: '',
  agentRuntimeImageId: '',
  agentRuntimeImageTag: '',
};

// Requests are what scheduling reserves, so they are the useful number when
// choosing between flavors; limits are the ceiling and are left out.
function describeResources(resources?: { requestsCpu: string; requestsMemory: string }): string | undefined {
  if (!resources) return undefined;
  const parts = [resources.requestsCpu, resources.requestsMemory].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : undefined;
}

function EnvironmentDialog({
  organizationId,
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel,
  initialValues,
  runnerOptions,
  flavorsByRunner,
  isSubmitting,
  onSubmit,
  testIdPrefix,
}: EnvironmentDialogProps) {
  const [values, setValues] = useState<EnvironmentValues>(initialValues);
  const [errors, setErrors] = useState<EnvironmentFieldErrors>({});

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setValues(initialValues);
      setErrors({});
    }
  };

  const flavorOptions = flavorsByRunner.get(values.runnerId) ?? [];

  // Generic over the field: every other value is a string, availability is an
  // enum, and typing it as string would only push the cast to the call sites.
  const updateValue = <K extends keyof EnvironmentValues>(field: K, value: EnvironmentValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = () => {
    const name = values.name.trim();
    const nextErrors: EnvironmentFieldErrors = {};

    if (!name) nextErrors.name = 'Name is required.';
    if (!values.runnerId) nextErrors.runnerId = 'Runner is required.';
    if (!values.workspaceImageId) nextErrors.workspaceImageId = 'Workspace image is required.';
    if (!values.workspaceImageTag) nextErrors.workspaceImageTag = 'A version is required.';

    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    // Flavor is a catalog entry name the runner resolves at workload start, so an
    // unknown or empty value is accepted here: empty means the runner's default.
    onSubmit({ ...values, name, flavor: values.flavor.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid={`${testIdPrefix}-dialog`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-name`}>Name</Label>
            <Input
              id={`${testIdPrefix}-name`}
              value={values.name}
              onChange={(event) => updateValue('name', event.target.value)}
              placeholder="default"
              data-testid={`${testIdPrefix}-name`}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
          </div>
          <div className="space-y-2">
            <ImageSelector
              organizationId={organizationId}
              types={[ImageType.WORKSPACE]}
              label="Workspace image"
              imageId={values.workspaceImageId}
              imageTag={values.workspaceImageTag}
              onChange={(imageId, imageTag) => {
                updateValue('workspaceImageId', imageId);
                updateValue('workspaceImageTag', imageTag);
              }}
              testIdPrefix={`${testIdPrefix}-workspace`}
            />
            {errors.workspaceImageId ? (
              <p className="text-xs text-destructive">{errors.workspaceImageId}</p>
            ) : null}
            {errors.workspaceImageTag ? (
              <p className="text-xs text-destructive">{errors.workspaceImageTag}</p>
            ) : null}
          </div>
          <ImageSelector
            organizationId={organizationId}
            types={[ImageType.AGENT_RUNTIME]}
            label="Agent runtime image (optional)"
            description="Supplies the agent CLI. Leave empty for a workspace-only environment — usable by a sandbox, rejected when creating an agent."
            imageId={values.agentRuntimeImageId}
            imageTag={values.agentRuntimeImageTag}
            onChange={(imageId, imageTag) => {
              updateValue('agentRuntimeImageId', imageId);
              updateValue('agentRuntimeImageTag', imageTag);
            }}
            testIdPrefix={`${testIdPrefix}-runtime`}
          />
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-availability`}>Availability</Label>
            <Select
              value={String(values.availability)}
              onValueChange={(value) => updateValue('availability', Number(value) as EnvironmentAvailability)}
            >
              <SelectTrigger
                id={`${testIdPrefix}-availability`}
                className="w-full"
                data-testid={`${testIdPrefix}-availability`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(EnvironmentAvailability.INTERNAL)}>
                  Internal — every member of the organization
                </SelectItem>
                <SelectItem value={String(EnvironmentAvailability.PRIVATE)}>
                  Private — only who it is shared with
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-runner`}>Runner</Label>
            <Select value={values.runnerId} onValueChange={(value) => updateValue('runnerId', value)}>
              <SelectTrigger id={`${testIdPrefix}-runner`} className="w-full" data-testid={`${testIdPrefix}-runner`}>
                <SelectValue placeholder="Select runner" />
              </SelectTrigger>
              <SelectContent>
                {runnerOptions.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No runners available
                  </SelectItem>
                ) : null}
                {runnerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.runnerId ? <p className="text-xs text-destructive">{errors.runnerId}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${testIdPrefix}-flavor`}>Flavor</Label>
            <ComboboxInput
              id={`${testIdPrefix}-flavor`}
              value={values.flavor}
              onValueChange={(value) => updateValue('flavor', value)}
              options={flavorOptions}
              placeholder="small"
              emptyMessage={
                values.runnerId ? 'This runner reports no flavors' : 'Select a runner first'
              }
              data-testid={`${testIdPrefix}-flavor`}
            />
            <p className="text-xs text-muted-foreground">
              Entry from the runner's flavor catalog. Leave empty to use the runner's default flavor.
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isSubmitting} data-testid={`${testIdPrefix}-cancel`}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting} data-testid={`${testIdPrefix}-submit`}>
            {isSubmitting ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationEnvironmentsTab() {
  useDocumentTitle('Environments');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Environment | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const environmentsQuery = useInfiniteQuery({
    queryKey: ['environments', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      agentsClient.listEnvironments({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'options'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Every flavor in the organization, grouped by runner. One request rather
  // than a refetch each time the dialog's runner changes; catalogs are small
  // and the runner list is fetched the same way.
  const flavorsQuery = useQuery({
    queryKey: ['runners', organizationId, 'flavors', 'options'],
    queryFn: () => runnersClient.listFlavors({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const flavorsByRunner = useMemo(() => {
    const grouped = new Map<string, ComboboxOption[]>();
    for (const flavor of flavorsQuery.data?.flavors ?? []) {
      // A deprecated entry still resolves, but offering it invites new use.
      if (flavor.deprecated) continue;
      const options = grouped.get(flavor.runnerId) ?? [];
      options.push({
        value: flavor.name,
        label: flavor.name,
        description: flavor.default ? 'Runner default' : describeResources(flavor.resources),
      });
      grouped.set(flavor.runnerId, options);
    }
    return grouped;
  }, [flavorsQuery.data]);

  const createMutation = useMutation({
    mutationFn: (values: EnvironmentValues) => agentsClient.createEnvironment({ organizationId, ...values }),
    onSuccess: () => {
      toast.success('Environment created.');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['environments', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create environment.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ environmentId, values }: { environmentId: string; values: EnvironmentValues }) =>
      agentsClient.updateEnvironment({ id: environmentId, ...values }),
    onSuccess: () => {
      toast.success('Environment updated.');
      setEditTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['environments', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update environment.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (environmentId: string) => agentsClient.deleteEnvironment({ id: environmentId }),
    onSuccess: () => {
      toast.success('Environment deleted.');
      setDeleteTargetId(null);
      void queryClient.invalidateQueries({ queryKey: ['environments', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete environment.');
    },
  });

  const environments = useMemo(
    () => environmentsQuery.data?.pages.flatMap((page) => page.environments) ?? [],
    [environmentsQuery.data],
  );

  const runnerOptions = useMemo(() => {
    const runners = runnersQuery.data?.runners ?? [];
    return runners
      .map((runner) => ({ value: runner.meta?.id ?? '', label: runner.name || runner.meta?.id || '' }))
      .filter((option) => option.value)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [runnersQuery.data?.runners]);

  const imageRef = useImageRef(organizationId);

  const runnerLabel = (runnerId: string) =>
    runnerOptions.find((option) => option.value === runnerId)?.label || runnerId || '—';

  const listControls = useListControls({
    items: environments,
    searchFields: [
      (environment) => environment.name,
      (environment) => environment.meta?.id ?? '',
      (environment) => imageRef(environment.workspaceImageId, environment.workspaceImageTag, environment.image),
      (environment) => runnerLabel(environment.runnerId),
      (environment) => environment.flavor,
    ],
    sortOptions: {
      name: (environment) => environment.name,
      image: (environment) => imageRef(environment.workspaceImageId, environment.workspaceImageTag, environment.image),
      runner: (environment) => runnerLabel(environment.runnerId),
      flavor: (environment) => environment.flavor,
      created: (environment) => timestampToMillis(environment.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleEnvironments = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  const handleEditOpen = (environment: Environment) => {
    if (!environment.meta?.id) {
      toast.error('Missing environment ID.');
      return;
    }
    setEditTarget(environment);
  };

  const handleDeleteOpen = (environment: Environment) => {
    const environmentId = environment.meta?.id;
    if (!environmentId) {
      toast.error('Missing environment ID.');
      return;
    }
    setDeleteTargetId(environmentId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search environments..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="organization-environments-create"
        >
          Add environment
        </Button>
      </div>
      {environmentsQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading environments...</div>
      ) : null}
      {environmentsQuery.isError ? (
        <div className="text-sm text-muted-foreground">Failed to load environments.</div>
      ) : null}
      {environments.length === 0 && !environmentsQuery.isPending ? (
        <Card className="border-border" data-testid="organization-environments-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No environments configured. Sandboxes need one to start.
          </CardContent>
        </Card>
      ) : null}
      {environments.length > 0 ? (
        <Card className="border-border" data-testid="organization-environments-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1.5fr_2fr_1fr_1fr_1fr_140px]"
              data-testid="organization-environments-header"
            >
              <SortableHeader
                label="Environment"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Image"
                sortKey="image"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Runner"
                sortKey="runner"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Flavor"
                sortKey="flavor"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visibleEnvironments.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No environments configured.'}
                </div>
              ) : (
                visibleEnvironments.map((environment) => (
                  <div
                    key={environment.meta?.id ?? environment.name}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1.5fr_2fr_1fr_1fr_1fr_140px]"
                    data-testid="organization-environment-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="organization-environment-name">
                        {environment.meta?.id ? (
                          <NavLink
                            to={`/organizations/${organizationId}/environments/${environment.meta.id}`}
                            className="hover:underline"
                            data-testid="organization-environment-view"
                          >
                            {environment.name}
                          </NavLink>
                        ) : (
                          environment.name
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="organization-environment-id">
                        {environment.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span
                      className="text-xs break-all text-muted-foreground"
                      data-testid="organization-environment-image"
                    >
                      {imageRef(environment.workspaceImageId, environment.workspaceImageTag, environment.image)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-environment-runner">
                      {runnerLabel(environment.runnerId)}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-environment-flavor">
                      {environment.flavor || 'Runner default'}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="organization-environment-created">
                      {formatDateOnly(environment.meta?.createdAt)}
                    </span>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOpen(environment)}
                        data-testid="organization-environment-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteOpen(environment)}
                        data-testid="organization-environment-delete"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <LoadMoreButton
        hasMore={Boolean(environmentsQuery.hasNextPage)}
        isLoading={environmentsQuery.isFetchingNextPage}
        onClick={() => {
          void environmentsQuery.fetchNextPage();
        }}
      />
      <EnvironmentDialog
        organizationId={organizationId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add environment"
        description="Define the images, runner, and flavor workloads start with."
        submitLabel="Add environment"
        pendingLabel="Adding..."
        initialValues={emptyEnvironmentValues}
        runnerOptions={runnerOptions}
          flavorsByRunner={flavorsByRunner}
        isSubmitting={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
        testIdPrefix="organization-environments-create"
      />
      {editTarget ? (
        <EnvironmentDialog
          organizationId={organizationId}
          key={editTarget.meta?.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          title="Edit environment"
          description="Update the images, runner, and flavor workloads start with."
          submitLabel="Save changes"
          pendingLabel="Saving..."
          initialValues={{
            name: editTarget.name,
            availability: editTarget.availability,
            runnerId: editTarget.runnerId,
            flavor: editTarget.flavor,
            workspaceImageId: editTarget.workspaceImageId,
            workspaceImageTag: editTarget.workspaceImageTag,
            agentRuntimeImageId: editTarget.agentRuntimeImageId,
            agentRuntimeImageTag: editTarget.agentRuntimeImageTag,
          }}
          runnerOptions={runnerOptions}
          flavorsByRunner={flavorsByRunner}
          isSubmitting={updateMutation.isPending}
          onSubmit={(values) => {
            const environmentId = editTarget.meta?.id;
            if (!environmentId) return;
            updateMutation.mutate({ environmentId, values });
          }}
          testIdPrefix="organization-environments-edit"
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete environment"
        description="Sandboxes referencing this environment will no longer start."
        confirmLabel="Delete environment"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
