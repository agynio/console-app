import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { JsonEditor } from '@/components/JsonEditor';
import { ConfigurationForm } from '@/components/ConfigurationForm';
import {
  configurationMismatch,
  readConfigurationSchema,
  toSubmittedConfiguration,
  validateConfiguration,
} from '@/lib/configurationSchema';
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
  const [values, setValues] = useState<JsonObject>({});
  const [propertyErrors, setPropertyErrors] = useState<Record<string, string>>({});
  const [slugError, setSlugError] = useState('');
  const [configurationError, setConfigurationError] = useState('');

  const appQuery = useQuery({
    queryKey: ['app', installation?.appId],
    queryFn: () => appsClient.getApp({ id: installation?.appId ?? '' }),
    enabled: open && Boolean(installation?.appId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const schema = useMemo(
    () => readConfigurationSchema(appQuery.data?.app?.configurationSchema?.toJson() as JsonObject | undefined),
    [appQuery.data?.app],
  );

  const storedValues = useMemo(
    () => (installation?.configuration ? (installation.configuration as JsonObject) : {}),
    [installation?.configuration],
  );
  const secretKeysSet = useMemo(() => installation?.secretKeysSet ?? [], [installation?.secretKeysSet]);

  // Stored configuration the current schema does not accept is repaired
  // through the JSON editor: the generated form cannot express it.
  const mismatch = useMemo(
    () => (schema ? configurationMismatch(schema, storedValues, secretKeysSet) : []),
    [schema, storedValues, secretKeysSet],
  );
  const useForm = Boolean(schema) && mismatch.length === 0;

  useEffect(() => {
    if (open && installation) {
      setSlug(installation.slug);
      setConfiguration(installation.configuration ? JSON.stringify(installation.configuration, null, 2) : '');
      setValues(storedValues);
      setPropertyErrors({});
      setSlugError('');
      setConfigurationError('');
    }
    if (!open) {
      setSlug('');
      setConfiguration('');
      setValues({});
      setPropertyErrors({});
      setSlugError('');
      setConfigurationError('');
    }
  }, [open, installation, storedValues]);

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

    let parsedConfig: JsonObject | undefined;
    if (useForm && schema) {
      const failures = validateConfiguration(schema, values, secretKeysSet);
      if (Object.keys(failures).length > 0) {
        setPropertyErrors(failures);
        return;
      }
      setPropertyErrors({});
      // A secret left untouched is absent from values, so it is absent from the
      // write and the server keeps what is stored.
      parsedConfig = toSubmittedConfiguration(schema, values);
    } else {
      const trimmedConfig = configuration.trim();
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
          <div className="space-y-2">
            <Label htmlFor="update-installation-slug">Slug</Label>
            <Input
              id="update-installation-slug"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                if (slugError) setSlugError('');
              }}
              data-testid="update-installation-slug"
            />
            {slugError && <p className="text-sm text-destructive">{slugError}</p>}
          </div>
          {useForm && schema ? (
            <div className="space-y-2" data-testid="update-installation-configuration-form">
              <Label>Configuration</Label>
              <ConfigurationForm
                schema={schema}
                values={values}
                onChange={(next) => {
                  setValues(next);
                  setPropertyErrors({});
                }}
                secretKeysSet={secretKeysSet}
                errors={propertyErrors}
                organizationId={organizationId}
                disabled={updateMutation.isPending}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {mismatch.length > 0 ? (
                <p className="text-sm text-destructive" data-testid="update-installation-configuration-mismatch">
                  This installation&apos;s configuration does not match what the app now expects (
                  {mismatch.join(', ')}). Edit it directly to repair it.
                </p>
              ) : null}
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
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid="update-installation-cancel">
              Cancel
            </Button>
          </DialogClose>
          <Button
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
