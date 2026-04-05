import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient, organizationsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ScriptEditor } from '@/components/ScriptEditor';
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
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type RegisterAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RegisterAppDialog({ open, onOpenChange }: RegisterAppDialogProps) {
  const queryClient = useQueryClient();
  const [organizationId, setOrganizationId] = useState('');
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [permissions, setPermissions] = useState('');
  const [visibility, setVisibility] = useState<AppVisibility>(AppVisibility.INTERNAL);
  const [organizationError, setOrganizationError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [nameError, setNameError] = useState('');
  const [serviceToken, setServiceToken] = useState('');

  const organizationsQuery = useQuery({
    queryKey: ['organizations', 'list'],
    queryFn: () => organizationsClient.listOrganizations({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const organizations = useMemo(
    () => organizationsQuery.data?.organizations ?? [],
    [organizationsQuery.data?.organizations],
  );

  const createAppMutation = useMutation({
    mutationFn: (payload: {
      organizationId: string;
      slug: string;
      name: string;
      description: string;
      icon: string;
      visibility: AppVisibility;
      permissions: string[];
    }) => appsClient.createApp(payload),
    onSuccess: (response) => {
      setServiceToken(response.serviceToken);
      void queryClient.invalidateQueries({ queryKey: ['apps', 'list'] });
      toast.success('App registered.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to register app.');
    },
  });

  const resetState = () => {
    setOrganizationId('');
    setSlug('');
    setName('');
    setDescription('');
    setIcon('');
    setPermissions('');
    setVisibility(AppVisibility.INTERNAL);
    setOrganizationError('');
    setSlugError('');
    setNameError('');
    setServiceToken('');
  };

  const closeDialog = () => {
    onOpenChange(false);
    resetState();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && serviceToken) return;
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleCreateApp = () => {
    const trimmedOrganizationId = organizationId.trim();
    const trimmedSlug = slug.trim();
    const trimmedName = name.trim();

    if (!trimmedOrganizationId) {
      setOrganizationError('Organization is required.');
    }
    if (!trimmedSlug) {
      setSlugError('Slug is required.');
    }
    if (!trimmedName) {
      setNameError('Name is required.');
    }
    if (!trimmedOrganizationId || !trimmedSlug || !trimmedName) return;

    setOrganizationError('');
    setSlugError('');
    setNameError('');

    const permissionList = permissions
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    createAppMutation.mutate({
      organizationId: trimmedOrganizationId,
      slug: trimmedSlug,
      name: trimmedName,
      description: description.trim(),
      icon: icon.trim(),
      visibility,
      permissions: permissionList,
    });
  };

  const handleCopyToken = async () => {
    try {
      await navigator.clipboard.writeText(serviceToken);
      toast.success('Token copied to clipboard.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy token.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="apps-register-dialog">
        <DialogHeader>
          <DialogTitle data-testid="apps-register-title">Register app</DialogTitle>
          <DialogDescription data-testid="apps-register-description">
            Create a new app registration and copy its service token.
          </DialogDescription>
        </DialogHeader>
        {serviceToken ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--agyn-dark)]" data-testid="apps-register-token-label">
                Service token
              </div>
              <div
                className="mt-2 rounded-md border border-[var(--agyn-border-subtle)] bg-[var(--agyn-secondary)] p-3 text-xs font-mono text-[var(--agyn-dark)] break-all"
                data-testid="apps-register-token-value"
              >
                {serviceToken}
              </div>
            </div>
            <p className="text-xs text-[var(--agyn-gray)]" data-testid="apps-register-token-warning">
              This token will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyToken} data-testid="apps-register-copy">
                Copy token
              </Button>
              <Button variant="primary" size="sm" onClick={closeDialog} data-testid="apps-register-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Organization</div>
              <Select
                value={organizationId}
                onValueChange={(value) => {
                  setOrganizationId(value);
                  if (organizationError) setOrganizationError('');
                }}
              >
                <SelectTrigger data-testid="apps-register-organization">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.length > 0 ? (
                    organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name || org.id}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {organizationsQuery.isPending ? 'Loading organizations...' : 'No organizations available'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {organizationError ? <p className="text-sm text-red-500">{organizationError}</p> : null}
            </div>
            <Input
              label="Slug"
              placeholder="my-app"
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                if (slugError) setSlugError('');
              }}
              error={slugError}
              data-testid="apps-register-slug"
            />
            <Input
              label="Name"
              placeholder="My App"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError('');
              }}
              error={nameError}
              data-testid="apps-register-name"
            />
            <ScriptEditor
              label="Description"
              placeholder="Describe what this app does"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              minHeightClass="min-h-[100px]"
              data-testid="apps-register-description-input"
            />
            <Input
              label="Icon"
              placeholder="https://example.com/icon.png"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              data-testid="apps-register-icon"
            />
            <div className="space-y-2">
              <div className="text-sm text-[var(--agyn-dark)]">Visibility</div>
              <Select
                value={visibility === AppVisibility.PUBLIC ? 'public' : 'internal'}
                onValueChange={(value) =>
                  setVisibility(value === 'public' ? AppVisibility.PUBLIC : AppVisibility.INTERNAL)
                }
              >
                <SelectTrigger data-testid="apps-register-visibility">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Permissions"
              placeholder="read:models, write:models"
              value={permissions}
              onChange={(event) => setPermissions(event.target.value)}
              helperText="Comma-separated permissions."
              data-testid="apps-register-permissions"
            />
          </div>
        )}
        {serviceToken ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="apps-register-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateApp}
              disabled={createAppMutation.isPending}
              data-testid="apps-register-submit"
            >
              {createAppMutation.isPending ? 'Registering...' : 'Register app'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
