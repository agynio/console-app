import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { JsonObject } from '@bufbuild/protobuf';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type InstallAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
};

export function InstallAppDialog({ open, onOpenChange, organizationId }: InstallAppDialogProps) {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState('');
  const [slug, setSlug] = useState('');
  const [configuration, setConfiguration] = useState('');
  const [appError, setAppError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [configurationError, setConfigurationError] = useState('');

  const appsQuery = useQuery({
    queryKey: ['apps', 'list'],
    queryFn: () => appsClient.listApps({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const apps = useMemo(() => appsQuery.data?.apps ?? [], [appsQuery.data?.apps]);
  const appOptions = useMemo(
    () => apps.flatMap((app) => (app.meta?.id ? [{ id: app.meta.id, slug: app.slug, name: app.name }] : [])),
    [apps],
  );

  const installMutation = useMutation({
    mutationFn: (payload: {
      appId: string;
      organizationId: string;
      slug: string;
      configuration?: JsonObject;
    }) => appsClient.installApp(payload),
    onSuccess: () => {
      toast.success('App installed.');
      void queryClient.invalidateQueries({ queryKey: ['installations', organizationId] });
      onOpenChange(false);
      setAppId('');
      setSlug('');
      setConfiguration('');
      setAppError('');
      setSlugError('');
      setConfigurationError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to install app.');
    },
  });

  const resetState = () => {
    setAppId('');
    setSlug('');
    setConfiguration('');
    setAppError('');
    setSlugError('');
    setConfigurationError('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleAppChange = (value: string) => {
    setAppId(value);
    if (appError) setAppError('');
    const selected = appOptions.find((option) => option.id === value);
    if (selected) {
      setSlug(selected.slug);
    }
  };

  const handleInstall = () => {
    const trimmedAppId = appId.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedAppId) {
      setAppError('App selection is required.');
    }
    if (!trimmedSlug) {
      setSlugError('Slug is required.');
    }
    if (!trimmedAppId || !trimmedSlug) return;

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

    setAppError('');
    setSlugError('');
    setConfigurationError('');

    installMutation.mutate({
      appId: trimmedAppId,
      organizationId,
      slug: trimmedSlug,
      configuration: parsedConfig,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="install-app-dialog">
        <DialogHeader>
          <DialogTitle data-testid="install-app-title">Install app</DialogTitle>
          <DialogDescription data-testid="install-app-description">
            Install a registered app into this organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-[var(--agyn-dark)]">App</div>
            <Select value={appId} onValueChange={handleAppChange}>
              <SelectTrigger data-testid="install-app-select">
                <SelectValue placeholder="Select app" />
              </SelectTrigger>
              <SelectContent>
                {appOptions.length > 0 ? (
                  appOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name || option.slug} ({option.slug})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    {appsQuery.isPending ? 'Loading apps...' : 'No apps available'}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {appError ? <p className="text-sm text-red-500">{appError}</p> : null}
          </div>
          <Input
            label="Slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              if (slugError) setSlugError('');
            }}
            error={slugError}
            data-testid="install-app-slug"
          />
          <JsonEditor
            label="Configuration"
            value={configuration}
            onChange={(nextValue) => {
              setConfiguration(nextValue);
              if (configurationError) setConfigurationError('');
            }}
            error={configurationError}
            testId="install-app-configuration"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" data-testid="install-app-cancel">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="sm"
            onClick={handleInstall}
            disabled={installMutation.isPending}
            data-testid="install-app-submit"
          >
            {installMutation.isPending ? 'Installing...' : 'Install app'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
