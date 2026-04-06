import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { toast } from 'sonner';

type CreateAppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
};

export function CreateAppDialog({ open, onOpenChange, organizationId }: CreateAppDialogProps) {
  const queryClient = useQueryClient();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [permissions, setPermissions] = useState('');
  const [visibility, setVisibility] = useState<AppVisibility>(AppVisibility.INTERNAL);
  const [slugError, setSlugError] = useState('');
  const [nameError, setNameError] = useState('');
  const [serviceToken, setServiceToken] = useState('');

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
      void queryClient.invalidateQueries({ queryKey: ['apps', 'published', organizationId] });
      void queryClient.invalidateQueries({ queryKey: ['apps', 'list'] });
      toast.success('App created.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create app.');
    },
  });

  const resetState = () => {
    setSlug('');
    setName('');
    setDescription('');
    setIcon('');
    setPermissions('');
    setVisibility(AppVisibility.INTERNAL);
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
    const trimmedSlug = slug.trim();
    const trimmedName = name.trim();

    if (!trimmedSlug) {
      setSlugError('Slug is required.');
    }
    if (!trimmedName) {
      setNameError('Name is required.');
    }
    if (!trimmedSlug || !trimmedName) return;

    setSlugError('');
    setNameError('');

    const permissionList = permissions
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    createAppMutation.mutate({
      organizationId,
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
      <DialogContent data-testid="create-app-dialog">
        <DialogHeader>
          <DialogTitle>Create app</DialogTitle>
          <DialogDescription>Publish a new app and copy its service token.</DialogDescription>
        </DialogHeader>
        {serviceToken ? (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground">Service token</div>
              <div
                className="mt-2 rounded-md border border-border bg-muted p-3 text-xs font-mono text-foreground break-all"
                data-testid="create-app-token-value"
              >
                {serviceToken}
              </div>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="create-app-token-warning">
              This token will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyToken} data-testid="create-app-copy">
                Copy token
              </Button>
              <Button size="sm" onClick={closeDialog} data-testid="create-app-done">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-app-slug">Slug</Label>
              <Input
                id="create-app-slug"
                placeholder="my-app"
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  if (slugError) setSlugError('');
                }}
                data-testid="create-app-slug"
              />
              {slugError && <p className="text-sm text-destructive">{slugError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-app-name">Name</Label>
              <Input
                id="create-app-name"
                placeholder="My App"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="create-app-name"
              />
              {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            </div>
            <ScriptEditor
              label="Description"
              placeholder="Describe what this app does"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              minHeightClass="min-h-[100px]"
              data-testid="create-app-description-input"
            />
            <div className="space-y-2">
              <Label htmlFor="create-app-icon">Icon</Label>
              <Input
                id="create-app-icon"
                placeholder="https://example.com/icon.png"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                data-testid="create-app-icon"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-foreground">Visibility</div>
              <Select
                value={visibility === AppVisibility.PUBLIC ? 'public' : 'internal'}
                onValueChange={(value) =>
                  setVisibility(value === 'public' ? AppVisibility.PUBLIC : AppVisibility.INTERNAL)
                }
              >
                <SelectTrigger data-testid="create-app-visibility">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-app-permissions">Permissions</Label>
              <Input
                id="create-app-permissions"
                placeholder="read:models, write:models"
                value={permissions}
                onChange={(event) => setPermissions(event.target.value)}
                data-testid="create-app-permissions"
              />
              <p className="text-sm text-muted-foreground">Comma-separated permissions.</p>
            </div>
          </div>
        )}
        {serviceToken ? null : (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="create-app-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreateApp}
              disabled={createAppMutation.isPending}
              data-testid="create-app-submit"
            >
              {createAppMutation.isPending ? 'Creating...' : 'Create app'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
