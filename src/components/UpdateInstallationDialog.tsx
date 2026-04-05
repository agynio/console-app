import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { JsonEditor } from '@/components/JsonEditor';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Installation } from '@/gen/agynio/api/apps/v1/apps_pb';
import type { JsonObject } from '@bufbuild/protobuf';
import { toast } from 'sonner';

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type UpdateInstallationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installation: Installation | null;
  organizationId: string;
};

export function UpdateInstallationDialog({
  open,
  onOpenChange,
  installation,
  organizationId,
}: UpdateInstallationDialogProps) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [slugError, setSlugError] = useState('');
  const [configurationError, setConfigurationError] = useState('');

  useEffect(() => {
    if (open && installation) {
      setSlug(installation.slug);
      setConfiguration(installation.configuration ? JSON.stringify(installation.configuration, null, 2) : '');
      setSlugError('');
      setConfigurationError('');
    }
    if (!open) {
      setSlug('');
      setConfiguration('');
      setSlugError('');
      setConfigurationError('');
    }
  }, [open, installation]);

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; slug: string; configuration?: JsonObject }) =>
      appsClient.updateInstallation(payload),
    onSuccess: () => {
      toast.success('Installation updated.');
      void queryClient.invalidateQueries({ queryKey: ['installations', organizationId] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update installation.');
    },
  });

  const handleSave = () => {
    if (!installation?.meta?.id) return;
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      setSlugError('Slug is required.');
      return;
    }

    const trimmedConfig = configuration.trim();
    let parsedConfig: JsonObject | undefined;
    if (trimmedConfig) {
      try {
        const parsed = JSON.parse(trimmedConfig);
        if (!isJsonObject(parsed)) {
          setConfigurationError('Configuration must be a JSON object.');
          return;
        }
        parsedConfig = parsed;
      } catch {
        setConfigurationError('Invalid JSON format.');
        return;
      }
    }

    setSlugError('');
    setConfigurationError('');

    updateMutation.mutate({
      id: installation.meta.id,
      slug: trimmedSlug,
      configuration: parsedConfig,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="update-installation-dialog">
        <DialogHeader>
          <DialogTitle data-testid="update-installation-title">Configure installation</DialogTitle>
          <DialogDescription data-testid="update-installation-description">
            Update installation slug and configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            label="Slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              if (slugError) setSlugError('');
            }}
            error={slugError}
            data-testid="update-installation-slug"
          />
          <JsonEditor
            label="Configuration"
            value={configuration}
            onChange={(nextValue) => {
              setConfiguration(nextValue);
              if (configurationError) setConfigurationError('');
            }}
            error={configurationError}
            testId="update-installation-configuration"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid="update-installation-cancel">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending || !installation?.meta?.id}
            data-testid="update-installation-save"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
