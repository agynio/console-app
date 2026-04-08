import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { ScriptEditor } from '@/components/ScriptEditor';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppVisibility } from '@/gen/agynio/api/apps/v1/apps_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatAppVisibility, formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

export function AppDetailPage() {
  const { appId } = useParams();
  const resolvedAppId = appId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [visibility, setVisibility] = useState<AppVisibility>(AppVisibility.INTERNAL);
  const [nameError, setNameError] = useState('');

  const appQuery = useQuery({
    queryKey: ['apps', resolvedAppId],
    queryFn: () => appsClient.getApp({ id: resolvedAppId }),
    enabled: Boolean(resolvedAppId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const installationsQuery = useQuery({
    queryKey: ['installations', resolvedAppId, 'list'],
    queryFn: () =>
      appsClient.listInstallations({
        appId: resolvedAppId,
        organizationId: '',
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(resolvedAppId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const app = appQuery.data?.app;
  const installations = installationsQuery.data?.installations ?? [];

  useDocumentTitle(app?.name ?? 'App');

  const updateAppMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; icon: string; visibility: AppVisibility }) =>
      appsClient.updateApp({ id: resolvedAppId, ...payload }),
    onSuccess: () => {
      toast.success('App updated.');
      void queryClient.invalidateQueries({ queryKey: ['apps', resolvedAppId] });
      void queryClient.invalidateQueries({ queryKey: ['apps', 'list'] });
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update app.');
    },
  });

  const deleteAppMutation = useMutation({
    mutationFn: () => appsClient.deleteApp({ id: resolvedAppId }),
    onSuccess: () => {
      toast.success('App deleted.');
      void queryClient.invalidateQueries({ queryKey: ['apps', 'list'] });
      setDeleteOpen(false);
      navigate('/apps');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete app.');
    },
  });

  const resetEditState = () => {
    setName('');
    setDescription('');
    setIcon('');
    setVisibility(AppVisibility.INTERNAL);
    setNameError('');
  };

  const handleEditOpenChange = (open: boolean) => {
    if (open && app) {
      setName(app.name);
      setDescription(app.description);
      setIcon(app.icon);
      setVisibility(app.visibility);
      setNameError('');
      setEditOpen(true);
      return;
    }
    setEditOpen(false);
    resetEditState();
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required.');
      return;
    }
    setNameError('');
    updateAppMutation.mutate({
      name: trimmedName,
      description: description.trim(),
      icon: icon.trim(),
      visibility,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {app ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="app-detail-actions">
            <Button variant="outline" size="sm" onClick={() => handleEditOpenChange(true)}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
      {appQuery.isPending ? <div className="text-sm text-muted-foreground">Loading app...</div> : null}
      {appQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load app.</div> : null}
      {app ? (
        <Card className="border-border" data-testid="app-detail-card">
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Details</h3>
              <p className="text-sm text-muted-foreground">App identity and visibility.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
                <div className="text-sm text-foreground">{app.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Slug</div>
                <div className="text-sm text-foreground">{app.slug}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">App ID</div>
                <div className="text-sm text-foreground">{app.meta?.id ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Organization ID</div>
                <div className="text-sm text-foreground">{app.organizationId || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Identity ID</div>
                <div className="text-sm text-foreground">{app.identityId || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Visibility</div>
                <Badge variant="secondary">{formatAppVisibility(app.visibility)}</Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Created</div>
                <div className="text-sm text-foreground">{formatDateOnly(app.meta?.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated</div>
                <div className="text-sm text-foreground">{formatDateOnly(app.meta?.updatedAt)}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Permissions</div>
                {app.permissions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {app.permissions.map((permission) => (
                      <Badge key={permission} variant="secondary">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-foreground">—</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Installations</h3>
          <p className="text-sm text-muted-foreground">Organizations using this app.</p>
        </div>
        {installationsQuery.isPending ? (
          <div className="text-sm text-muted-foreground">Loading installations...</div>
        ) : null}
        {installationsQuery.isError ? (
          <div className="text-sm text-muted-foreground">Failed to load installations.</div>
        ) : null}
        {installations.length === 0 && !installationsQuery.isPending ? (
          <Card className="border-border" data-testid="app-installations-empty">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No installations yet.
            </CardContent>
          </Card>
        ) : null}
        {installations.length > 0 ? (
          <Card className="border-border" data-testid="app-installations-table">
            <CardContent className="px-0">
              <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr]">
                <span>Installation</span>
                <span>Organization ID</span>
                <span>Created</span>
              </div>
              <div className="divide-y divide-border">
                {installations.map((installation) => (
                  <div
                    key={installation.meta?.id ?? installation.slug}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr]"
                    data-testid="app-installation-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="app-installation-slug">
                        {installation.slug}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="app-installation-id">
                        {installation.meta?.id ?? '—'}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground" data-testid="app-installation-org">
                      {installation.organizationId || '—'}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid="app-installation-created">
                      {formatDateOnly(installation.meta?.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="app-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="app-edit-title">Edit app</DialogTitle>
            <DialogDescription data-testid="app-edit-description">
              Update core app metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-edit-name">Name</Label>
              <Input
                id="app-edit-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="app-edit-name"
              />
              {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
            </div>
            <ScriptEditor
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              minHeightClass="min-h-[100px]"
              data-testid="app-edit-description-input"
            />
            <div className="space-y-2">
              <Label htmlFor="app-edit-icon">Icon</Label>
              <Input
                id="app-edit-icon"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                data-testid="app-edit-icon"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-edit-visibility">Visibility</Label>
              <Select
                value={visibility === AppVisibility.PUBLIC ? 'public' : 'internal'}
                onValueChange={(value) =>
                  setVisibility(value === 'public' ? AppVisibility.PUBLIC : AppVisibility.INTERNAL)
                }
              >
                <SelectTrigger id="app-edit-visibility" data-testid="app-edit-visibility">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="app-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateAppMutation.isPending}
              data-testid="app-edit-save"
            >
              {updateAppMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete app"
        description="This action permanently removes the app."
        confirmLabel="Delete app"
        variant="danger"
        onConfirm={() => deleteAppMutation.mutate()}
        isPending={deleteAppMutation.isPending}
      />
    </div>
  );
}
