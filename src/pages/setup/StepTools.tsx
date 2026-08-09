import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ConnectError } from '@connectrpc/connect';
import { FileTextIcon, PlugIcon } from 'lucide-react';
import { agentsClient, imagesClient } from '@/api/client';
import { ChoiceCard } from '@/components/ChoiceCard';
import { Button } from '@/components/ui/button';
import type { Image } from '@/gen/agynio/api/images/v1/images_pb';
import { ImageType } from '@/gen/agynio/api/images/v1/images_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { newestTag } from './catalog';

type StepToolsProps = {
  organizationId: string;
  environmentId: string;
  onDone: () => void;
};

/** The one the platform ships, and the one this step turns on by default. */
const FILES_MCP_IMAGE = 'files-mcp';

/** What the MCP is called on the environment. The image is `files-mcp`; the tool is `files`. */
function toolName(imageName: string): string {
  return imageName.replace(/-mcp$/, '') || imageName;
}

function toolDescription(image: Image): string {
  if (image.name === FILES_MCP_IMAGE) return 'Opens files you attach in a conversation.';
  return image.description?.trim() || 'An MCP server from your image catalog.';
}

/**
 * The step exists to teach that tools are added rather than assumed, which is
 * why it shows the catalog rather than one switch: files-mcp is the example the
 * platform ships, not the feature on offer.
 *
 * The MCP goes on the environment, not on the agent — where tooling common to a
 * runtime belongs, and the only thing that exists at this point in the flow.
 */
export function StepTools({ organizationId, environmentId, onDone }: StepToolsProps) {
  // Null until the reader touches something: the default is derived rather than
  // written into state by an effect, so there is no frame where the catalog has
  // loaded and nothing is selected yet.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const imagesQuery = useQuery({
    queryKey: ['images', organizationId, 'setup', 'mcp'],
    queryFn: () =>
      imagesClient.listImages({
        organizationId,
        type: ImageType.MCP,
        pageSize: MAX_PAGE_SIZE,
        pageToken: '',
      }),
    enabled: Boolean(organizationId),
  });

  const images = useMemo(() => imagesQuery.data?.images ?? [], [imagesQuery.data?.images]);

  // The one the platform ships is on by default; a reader who turns it off
  // finds it off, because `chosen` then holds their answer.
  const selected = useMemo(() => {
    if (chosen) return chosen;
    const files = images.find((image) => image.name === FILES_MCP_IMAGE);
    return files?.meta?.id ? [files.meta.id] : [];
  }, [chosen, images]);

  const versionQueries = useQuery({
    queryKey: ['image-versions', 'setup-tools', selected.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        selected.map(async (imageId) => {
          const refreshed = await imagesClient.refreshImage({ imageId });
          return [imageId, newestTag(refreshed.versions ?? [])] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
    enabled: selected.length > 0,
    staleTime: 30_000,
  });

  const attach = useMutation({
    mutationFn: async () => {
      const tags = versionQueries.data ?? {};
      for (const imageId of selected) {
        const image = images.find((entry) => entry.meta?.id === imageId);
        if (!image) continue;
        await agentsClient.createMcp({
          environmentId,
          name: toolName(image.name),
          imageId,
          imageTag: tags[imageId] ?? '',
        });
      }
    },
    onSuccess: () => onDone(),
    onError: (cause) => {
      setError(cause instanceof ConnectError ? cause.message : 'Could not attach the tool.');
    },
  });

  const toggle = (imageId: string) => {
    setError('');
    setChosen(
      selected.includes(imageId)
        ? selected.filter((entry) => entry !== imageId)
        : [...selected, imageId],
    );
  };

  const resolving = selected.length > 0 && versionQueries.isPending;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Add a tool</h2>
        <p className="text-sm text-muted-foreground">
          Your agent starts with a shell and its workspace. Tools give it more — they&apos;re MCP
          servers, and they run alongside it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {images.map((image) => {
          const imageId = image.meta?.id ?? '';
          return (
            <ChoiceCard
              key={imageId}
              title={toolName(image.name)}
              description={
                <>
                  {toolDescription(image)}
                  <span className="mt-1 block font-mono text-xs text-muted-foreground">
                    {image.name}
                    {versionQueries.data?.[imageId] ? `:${versionQueries.data[imageId]}` : ''}
                  </span>
                </>
              }
              icon={image.name === FILES_MCP_IMAGE ? FileTextIcon : PlugIcon}
              selected={selected.includes(imageId)}
              onSelect={() => toggle(imageId)}
              disabled={attach.isPending}
              data-testid={`setup-tool-${toolName(image.name)}`}
            />
          );
        })}

        {/* Not a card that does nothing: it is the answer to "is this all there
            is?", which a single-item list otherwise leaves unanswered. */}
        <div
          className="flex items-center rounded-lg border border-dashed border-border bg-card p-4"
          data-testid="setup-tools-placeholder"
        >
          <p className="text-sm text-muted-foreground">
            {imagesQuery.isPending
              ? 'Looking for tools in your image catalog…'
              : 'Your other MCP images appear here.'}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Attached to the environment, so sandboxes get it too.
      </p>

      {error ? (
        <p className="text-sm text-destructive" data-testid="setup-tools-error">
          {error}
        </p>
      ) : null}

      <Button
        onClick={() => {
          setError('');
          attach.mutate();
        }}
        disabled={attach.isPending || imagesQuery.isPending || resolving}
        data-testid="setup-tools-submit"
      >
        {attach.isPending ? 'Attaching…' : 'Continue'}
      </Button>
    </div>
  );
}
