import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SecretPicker } from '@/components/SecretPicker';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ImageType,
  ImageVisibility,
  type Image,
} from '@/gen/agynio/api/images/v1/images_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { resolveSecretChoice, secretChoiceOf, type SecretChoice } from '@/lib/secret-choice';
import { toast } from 'sonner';

const ALL_TYPES = 'all';

// A public image owned elsewhere is usable here but not yours; the owner's name
// is what makes that legible, so it is shown as <owner>/<image>.
const imageLabel = (image: Image, organizationId: string) => {
  if (image.organizationId === organizationId) return image.name;
  // The slug rather than the name: it is unique platform-wide, and it is what
  // the pull reference for this image already carries.
  const owner = image.organizationSlug.trim();
  return owner ? `${owner}/${image.name}` : image.name;
};

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
  secret: SecretChoice;
  visibility: ImageVisibility;
  tagFilter: string;
};

const emptyValues: RegisterValues = {
  name: '',
  description: '',
  type: ImageType.WORKSPACE,
  repository: '',
  username: '',
  secret: secretChoiceOf(''),
  visibility: ImageVisibility.INTERNAL,
  tagFilter: '',
};

export function OrganizationImagesTab() {
  // The route is organizations/:id; the param is not named organizationId.
  const { id: organizationId = '' } = useParams();
  const queryClient = useQueryClient();
  useDocumentTitle('Images');

  const [registerOpen, setRegisterOpen] = useState(false);
  const [values, setValues] = useState<RegisterValues>(emptyValues);
  const [pendingDelete, setPendingDelete] = useState<Image | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);

  const listed = useQuery({
    queryKey: ['images', organizationId, 'all'],
    enabled: Boolean(organizationId),
    queryFn: () =>
      imagesClient.listImages({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
  });

  const images = useMemo(() => listed.data?.images ?? [], [listed.data]);

  // ListImages returns the organization's own images plus every public image on
  // the platform, so the split is by owner rather than by a second request.
  const { own, shared } = useMemo(() => {
    const filtered = images.filter(
      (image) => typeFilter === ALL_TYPES || String(image.type) === typeFilter,
    );
    return {
      own: filtered.filter((image) => image.organizationId === organizationId),
      shared: filtered.filter((image) => image.organizationId !== organizationId),
    };
  }, [images, organizationId, typeFilter]);

  const registerMutation = useMutation({
    mutationFn: async (input: RegisterValues) => {
      // The image holds the credential by reference, so a secret typed here is
      // created first and named by id. The password never reaches this service.
      const secretId = await resolveSecretChoice({
        organizationId,
        choice: input.secret,
        fallbackTitle: `${input.name.trim()} registry`,
        description: `Registry password for image "${input.name.trim()}"`,
      });
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId] });
      return imagesClient.createImage({
        organizationId,
        name: input.name.trim(),
        description: input.description.trim(),
        type: input.type,
        repository: input.repository.trim(),
        username: input.username.trim(),
        secretId,
        visibility: input.visibility,
        tagFilter: input.tagFilter.trim(),
      });
    },
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

  const table = (rows: Image[], emptyText: string, testId: string) => (
    <Card className="border-border">
      <CardContent className="px-0">
        {listed.isPending ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading images...</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
            {emptyText}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Repository</th>
                <th className="p-3 font-medium">Discovery</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((image) => {
                const id = image.meta?.id ?? '';
                return (
                  <tr key={id} className="border-b" data-testid={`image-row-${image.name}`}>
                    <td className="px-6 py-4">
                      <NavLink
                        to={`/organizations/${organizationId}/images/${id}`}
                        className="font-medium hover:underline"
                        data-testid={`image-link-${image.name}`}
                      >
                        {imageLabel(image, organizationId)}
                      </NavLink>
                      {image.description ? (
                        <div className="text-muted-foreground">{image.description}</div>
                      ) : null}
                    </td>
                    <td className="p-3">{TYPE_LABELS[image.type] ?? '—'}</td>
                    <td className="p-3 font-mono text-xs">{image.repository}</td>
                    <td className="p-3">
                      {image.staleSince ? (
                        <span data-testid="image-stale">Registry unreachable</span>
                      ) : image.lastDiscoveryAt ? (
                        formatDateOnly(image.lastDiscoveryAt)
                      ) : (
                        'Pending'
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {image.organizationId === organizationId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(image)}
                          data-testid={`image-delete-${image.name}`}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6" data-testid="organization-images">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="max-w-[220px]" data-testid="images-type-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            <SelectItem value={String(ImageType.WORKSPACE)}>Workspace</SelectItem>
            <SelectItem value={String(ImageType.AGENT_RUNTIME)}>Agent runtime</SelectItem>
            <SelectItem value={String(ImageType.MCP)}>MCP</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)} data-testid="images-register-open">
          Add image
        </Button>
      </div>

      <Tabs defaultValue="own">
        <TabsList>
          <TabsTrigger value="own" data-testid="images-tab-own">
            This organization
          </TabsTrigger>
          {/* Public images owned elsewhere: usable here, not editable here. */}
          <TabsTrigger value="shared" data-testid="images-tab-discover">
            Discover
          </TabsTrigger>
        </TabsList>
        <TabsContent value="own">{table(own, 'No images yet.', 'images')}</TabsContent>
        <TabsContent value="shared">
          {table(shared, 'No organization is sharing an image.', 'images-shared')}
        </TabsContent>
      </Tabs>

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
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={values.username}
                onChange={(event) => setValues({ ...values, username: event.target.value })}
                placeholder="optional"
                data-testid="images-register-username"
              />
            </div>
            <SecretPicker
              organizationId={organizationId}
              enabled={registerOpen}
              choice={values.secret}
              onChange={(secret) => setValues({ ...values, secret })}
              label="Password"
              allowNone
              noneLabel="None — the repository is readable anonymously"
              valueLabel="Password"
              titlePlaceholder={values.name.trim() ? `${values.name.trim()} registry` : undefined}
              testId="images-register-secret"
              helpText="Stored as a secret in this organization and referenced by the image. Never shown again."
            />
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
