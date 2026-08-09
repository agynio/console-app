import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { agentsClient, runnersClient } from '@/api/client';
import type { ComboboxOption } from '@/components/ComboboxInput';
import { describeResources } from '@/lib/flavors';
import {
  EnvironmentDialog,
  type EnvironmentValues,
} from '@/pages/OrganizationEnvironmentsTab';

const MAX_PAGE_SIZE = 200;

type EditEnvironmentDialogProps = {
  organizationId: string;
  environmentId: string;
  values: EnvironmentValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The same dialog the environments list edits with, on the page that shows one
 * environment — so what you change it with does not depend on where you found
 * it. The runner and flavor catalogs load here rather than being threaded down,
 * because a flavor name only resolves against the runner that reported it.
 */
export function EditEnvironmentDialog({
  organizationId,
  environmentId,
  values,
  open,
  onOpenChange,
}: EditEnvironmentDialogProps) {
  const queryClient = useQueryClient();

  const runnersQuery = useQuery({
    queryKey: ['runners', organizationId, 'list', 'options'],
    queryFn: () => runnersClient.listRunners({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: open && Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const flavorsQuery = useQuery({
    queryKey: ['runners', organizationId, 'flavors', 'options'],
    queryFn: () => runnersClient.listFlavors({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: open && Boolean(organizationId),
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

  const runnerOptions = useMemo(
    () =>
      (runnersQuery.data?.runners ?? []).map((runner) => ({
        value: runner.meta?.id ?? '',
        label: runner.name,
      })),
    [runnersQuery.data],
  );

  const updateMutation = useMutation({
    mutationFn: (next: EnvironmentValues) =>
      agentsClient.updateEnvironment({ id: environmentId, ...next }),
    onSuccess: () => {
      toast.success('Environment updated.');
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ['environment', environmentId] });
      void queryClient.invalidateQueries({ queryKey: ['environments', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update environment.');
    },
  });

  return (
    <EnvironmentDialog
      organizationId={organizationId}
      open={open}
      onOpenChange={onOpenChange}
      title="Edit environment"
      description="The images, runner and flavor workloads start with."
      submitLabel="Save changes"
      pendingLabel="Saving..."
      initialValues={values}
      runnerOptions={runnerOptions}
      flavorsByRunner={flavorsByRunner}
      isSubmitting={updateMutation.isPending}
      onSubmit={(next) => updateMutation.mutate(next)}
      testIdPrefix="environment-detail-edit"
    />
  );
}
