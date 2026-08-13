import { useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { imagesClient, secretsClient } from '@/api/client';
import { SecretPicker } from '@/components/SecretPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageType, ImageVisibility, ImageVersionState } from '@/gen/agynio/api/images/v1/images_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { EMPTY_PLACEHOLDER, formatDateOnly } from '@/lib/format';
import { groupVersions } from '@/lib/image-versions';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { resolveSecretChoice, secretChoiceOf, type SecretChoice } from '@/lib/secret-choice';

const TYPE_LABELS: Partial<Record<ImageType, string>> = {
  [ImageType.WORKSPACE]: 'Workspace',
  [ImageType.AGENT_RUNTIME]: 'Agent runtime',
  [ImageType.MCP]: 'MCP',
};

export function ImageDetailPage() {
  const { id: organizationIdParam, imageId: imageIdParam } = useParams();
  const organizationId = organizationIdParam ?? '';
  const imageId = imageIdParam ?? '';
  const queryClient = useQueryClient();

  const [credentialOpen, setCredentialOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState<SecretChoice>(secretChoiceOf(''));

  const imageQuery = useQuery({
    queryKey: ['images', 'detail', imageId],
    queryFn: () => imagesClient.getImage({ id: imageId }),
    enabled: Boolean(imageId),
  });

  // Opening the page refreshes, so a tag pushed a moment ago is listed without
  // waiting out the poll — the same contract the version picker has.
  const versionsQuery = useQuery({
    queryKey: ['image-versions', imageId],
    queryFn: () => imagesClient.refreshImage({ imageId }),
    enabled: Boolean(imageId),
  });

  const image = imageQuery.data?.image;
  useDocumentTitle(image?.name ?? 'Image');

  // Editing is the owner's; a public image owned elsewhere is readable here and
  // nothing more, and its owner's secrets are not listable from this
  // organization either.
  const owned = Boolean(image) && image?.organizationId === organizationId;

  // Named rather than shown: the credential is a reference, and its title is
  // what identifies it on the Secrets tab.
  const secretsQuery = useQuery({
    queryKey: ['secrets', organizationId, 'picker'],
    queryFn: () => secretsClient.listSecrets({ organizationId, pageSize: MAX_PAGE_SIZE }),
    enabled: owned && Boolean(image?.secretId),
  });

  const secretTitle =
    secretsQuery.data?.secrets.find((candidate) => candidate.meta?.id === image?.secretId)?.title ??
    image?.secretId;

  const updateCredential = useMutation({
    mutationFn: async () => {
      const secretId = await resolveSecretChoice({
        organizationId,
        choice: secret,
        fallbackTitle: `${image?.name ?? 'image'} registry`,
        description: `Registry password for image "${image?.name ?? ''}"`,
      });
      void queryClient.invalidateQueries({ queryKey: ['secrets', organizationId] });
      return imagesClient.updateImage({ id: imageId, username: username.trim(), secretId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['images'] });
      setCredentialOpen(false);
      toast.success('Credential updated');
    },
    // The repository is read with the new credential before it is stored, so a
    // wrong one fails here rather than at the next discovery pass.
    onError: (error: Error) => toast.error(error.message),
  });

  const openCredential = () => {
    setUsername(image?.username ?? '');
    setSecret(secretChoiceOf(image?.secretId ?? ''));
    setCredentialOpen(true);
  };

  const versions = versionsQuery.data?.versions ?? [];
  const { release, other } = groupVersions(versions);
  const ordered = [...release, ...other];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <NavLink to={`/organizations/${organizationId}/images`}>← Back to Images</NavLink>
      </Button>

      {imageQuery.isPending ? (
        <div className="text-sm text-muted-foreground">Loading image...</div>
      ) : !image ? (
        <div className="text-sm text-muted-foreground">Image not found.</div>
      ) : (
        <>
          <Card className="border-border">
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground" data-testid="image-detail-name">
                  {image.name}
                </h3>
                <p className="text-sm text-muted-foreground" data-testid="image-detail-description">
                  {image.description || 'No description.'}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Repository</div>
                  <div className="break-all font-mono text-sm" data-testid="image-detail-repository">
                    {image.repository}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Type</div>
                  <div className="text-sm">{TYPE_LABELS[image.type] ?? EMPTY_PLACEHOLDER}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Visibility</div>
                  <div className="text-sm">
                    {image.visibility === ImageVisibility.PUBLIC
                      ? 'Public — every organization on the platform'
                      : 'Internal — this organization only'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Credential</div>
                  <div className="text-sm" data-testid="image-detail-credential">
                    {image.secretId
                      ? `${image.username || 'no username'} · ${secretTitle}`
                      : 'Anonymous — the repository is read without one'}
                  </div>
                  {owned ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0"
                      onClick={openCredential}
                      data-testid="image-detail-credential-edit"
                    >
                      Edit credential
                    </Button>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Discovery</div>
                  <div className="text-sm" data-testid="image-detail-discovery">
                    {/* Stored versions are still served while a registry is
                        unreachable; saying so explains a stale list. */}
                    {image.staleSince
                      ? `Registry unreachable${
                          image.lastDiscoveryAt ? ` · last succeeded ${formatDateOnly(image.lastDiscoveryAt)}` : ''
                        }`
                      : image.lastDiscoveryAt
                        ? formatDateOnly(image.lastDiscoveryAt)
                        : 'Pending'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="px-0">
              {versionsQuery.isPending ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">Reading versions...</p>
              ) : ordered.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground" data-testid="image-versions-empty">
                  No versions discovered yet.
                </p>
              ) : (
                <table className="w-full text-sm" data-testid="image-versions">
                  <thead>
                    <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-6 py-4 font-medium">Version</th>
                      <th className="p-3 font-medium">Pushed</th>
                      <th className="p-3 font-medium">Description</th>
                      <th className="p-3 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((version) => (
                      <tr key={version.tag} className="border-b" data-testid={`image-version-${version.tag}`}>
                        <td className="px-6 py-4 font-mono text-xs">{version.tag}</td>
                        <td className="p-3">
                          {version.pushedAt ? formatDateOnly(version.pushedAt) : EMPTY_PLACEHOLDER}
                        </td>
                        <td className="p-3 text-muted-foreground">{version.description || EMPTY_PLACEHOLDER}</td>
                        <td className="p-3">
                          {/* A tag that vanished upstream is marked, not
                              deleted: environments naming it are flagged. */}
                          {version.state === ImageVersionState.GONE ? 'Gone upstream' : 'Present'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Dialog open={credentialOpen} onOpenChange={setCredentialOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit credential</DialogTitle>
                <DialogDescription>
                  The repository is read with the credential you name, so a wrong one fails here
                  rather than at the next discovery pass.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="optional"
                    data-testid="image-credential-username"
                  />
                </div>
                <SecretPicker
                  organizationId={organizationId}
                  enabled={credentialOpen}
                  choice={secret}
                  onChange={setSecret}
                  label="Password"
                  allowNone
                  noneLabel="None — the repository is readable anonymously"
                  valueLabel="Password"
                  titlePlaceholder={`${image.name} registry`}
                  testId="image-credential-secret"
                  helpText="Stored as a secret in this organization and referenced by the image. Never shown again."
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCredentialOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => updateCredential.mutate()}
                  disabled={updateCredential.isPending}
                  data-testid="image-credential-submit"
                >
                  {updateCredential.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
