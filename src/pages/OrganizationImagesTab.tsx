import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import {
  ImageType,
  ImageVisibility,
  type Image,
} from '@/gen/agynio/api/images/v1/images_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

const TYPE_LABELS: Partial<Record<ImageType, string>> = {
  [ImageType.WORKSPACE]: 'Workspace',
  [ImageType.AGENT_RUNTIME]: 'Agent runtime',
  [ImageType.MCP]: 'MCP',
};

type RegisterValues = {
  name: string;
  description: string;
  type: ImageType;
  repository: string;
  username: string;
  password: string;
  visibility: ImageVisibility;
  tagFilter: string;
};

const emptyValues: RegisterValues = {
  name: '',
  description: '',
  type: ImageType.WORKSPACE,
  repository: '',
  username: '',
  password: '',
  visibility: ImageVisibility.INTERNAL,
  tagFilter: '',
};

export function OrganizationImagesTab() {
  const { organizationId = '' } = useParams();
  const queryClient = useQueryClient();
  useDocumentTitle('Images');

  const [registerOpen, setRegisterOpen] = useState(false);
  const [values, setValues] = useState<RegisterValues>(emptyValues);
  const [pendingDelete, setPendingDelete] = useState<Image | null>(null);

  const listed = useQuery({
    queryKey: ['images', organizationId, 'all'],
    enabled: Boolean(organizationId),
    queryFn: () =>
      imagesClient.listImages({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
  });

  const images = useMemo(() => listed.data?.images ?? [], [listed.data]);

  const registerMutation = useMutation({
    mutationFn: (input: RegisterValues) =>
      imagesClient.createImage({
        organizationId,
        name: input.name.trim(),
        description: input.description.trim(),
        type: input.type,
        repository: input.repository.trim(),
        username: input.username.trim(),
        password: input.password,
        visibility: input.visibility,
        tagFilter: input.tagFilter.trim(),
      }),
    onSuccess: () => {
      // Versions arrive from a background discovery pass, so the list is
      // refetched rather than assumed complete.
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      setRegisterOpen(false);
      setValues(emptyValues);
      toast.success('Image registered');
    },
    // Registration validates the repository is readable, so a typo or a wrong
    // credential fails here rather than at workload start. Show what it said.
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => imagesClient.deleteImage({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      setPendingDelete(null);
      toast.success('Image deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4" data-testid="organization-images">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Images</h2>
          <p className="text-sm text-muted-foreground">
            Register an image once; its versions are read from the upstream repository.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)} data-testid="images-register-open">
          Register image
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {listed.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : images.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground" data-testid="images-empty">
              No images yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Repository</th>
                  <th className="p-3 font-medium">Visibility</th>
                  <th className="p-3 font-medium">Discovery</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {images.map((image) => {
                  const foreign = image.organizationId !== organizationId;
                  return (
                    <tr key={image.meta?.id} className="border-b" data-testid={`image-row-${image.name}`}>
                      <td className="p-3">
                        <div className="font-medium">{image.name}</div>
                        {image.description ? (
                          <div className="text-muted-foreground">{image.description}</div>
                        ) : null}
                      </td>
                      <td className="p-3">{TYPE_LABELS[image.type] ?? '—'}</td>
                      <td className="p-3 font-mono text-xs">{image.repository}</td>
                      <td className="p-3">
                        {image.visibility === ImageVisibility.PUBLIC ? 'Public' : 'Internal'}
                        {/* A public image from elsewhere is usable but not
                            yours to edit. */}
                        {foreign ? (
                          <span className="ml-2 text-muted-foreground" data-testid="image-foreign">
                            shared from another organization
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3">
                        {image.staleSince ? (
                          <span data-testid="image-stale">
                            Registry unreachable
                            {image.lastDiscoveryAt
                              ? ` · last succeeded ${formatDateOnly(image.lastDiscoveryAt)}`
                              : ''}
                          </span>
                        ) : image.lastDiscoveryAt ? (
                          formatDateOnly(image.lastDiscoveryAt)
                        ) : (
                          'Pending'
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {foreign ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(image)}
                            data-testid={`image-delete-${image.name}`}
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register image</DialogTitle>
            <DialogDescription>
              The repository is checked with the credential you supply, so a mistake fails here
              rather than when a workload starts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={values.name}
                onChange={(event) => setValues({ ...values, name: event.target.value })}
                placeholder="devcontainer-go"
                data-testid="images-register-name"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={values.description}
                onChange={(event) => setValues({ ...values, description: event.target.value })}
                data-testid="images-register-description"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={String(values.type)}
                onValueChange={(next) => setValues({ ...values, type: Number(next) as ImageType })}
              >
                <SelectTrigger data-testid="images-register-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(ImageType.WORKSPACE)}>Workspace</SelectItem>
                  <SelectItem value={String(ImageType.AGENT_RUNTIME)}>Agent runtime</SelectItem>
                  <SelectItem value={String(ImageType.MCP)}>MCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Repository</Label>
              <Input
                value={values.repository}
                onChange={(event) => setValues({ ...values, repository: event.target.value })}
                placeholder="ghcr.io/agynio/devcontainer-go"
                data-testid="images-register-repository"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Username</Label>
                <Input
                  value={values.username}
                  onChange={(event) => setValues({ ...values, username: event.target.value })}
                  placeholder="optional"
                  data-testid="images-register-username"
                />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={values.password}
                  onChange={(event) => setValues({ ...values, password: event.target.value })}
                  placeholder="optional"
                  data-testid="images-register-password"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Visibility</Label>
              <Select
                value={String(values.visibility)}
                onValueChange={(next) =>
                  setValues({ ...values, visibility: Number(next) as ImageVisibility })
                }
              >
                <SelectTrigger data-testid="images-register-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(ImageVisibility.INTERNAL)}>
                    Internal — this organization only
                  </SelectItem>
                  <SelectItem value={String(ImageVisibility.PUBLIC)}>
                    Public — every organization on the platform
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tag filter</Label>
              <Input
                value={values.tagFilter}
                onChange={(event) => setValues({ ...values, tagFilter: event.target.value })}
                placeholder="optional, e.g. v*"
                data-testid="images-register-tag-filter"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => registerMutation.mutate(values)}
              disabled={registerMutation.isPending || !values.name.trim() || !values.repository.trim()}
              data-testid="images-register-submit"
            >
              {registerMutation.isPending ? 'Registering…' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete image"
        // Deleting is allowed regardless of references; environments naming it
        // are flagged unschedulable rather than repaired.
        description={`Delete ${pendingDelete?.name ?? ''}? Environments naming it become unschedulable.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.meta?.id ?? '')}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
