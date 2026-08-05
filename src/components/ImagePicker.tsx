import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type ImageType, ImageVisibility, type Image } from '@/gen/agynio/api/images/v1/images_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

type ImagePickerProps = {
  organizationId: string;
  // The slot decides which images are worth showing. An MCP takes either a
  // purpose-built server image or a devcontainer, so it passes both.
  types: ImageType[];
  value: string;
  onChange: (imageId: string) => void;
  label: string;
  disabled?: boolean;
  testIdPrefix: string;
};

const imageLabel = (image: Image, organizationId: string) => {
  const parts = [image.name];
  if (image.description?.trim()) parts.push(image.description.trim());
  // A public image from another organization is usable but not yours, and the
  // list is the only place that difference is visible.
  if (image.visibility === ImageVisibility.PUBLIC && image.organizationId !== organizationId) {
    parts.push('shared');
  }
  // Stored versions are still served while a registry is unreachable; saying so
  // explains why the tag list may be behind.
  if (image.staleSince) parts.push('registry unreachable');
  return parts.join(' · ');
};

export function ImagePicker({
  organizationId,
  types,
  value,
  onChange,
  label,
  disabled,
  testIdPrefix,
}: ImagePickerProps) {
  const listed = useQuery({
    queryKey: ['images', organizationId, ...types],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      // One request per type: the filter takes a single type, and a slot that
      // accepts two is the exception rather than a reason to widen the API.
      const pages = await Promise.all(
        types.map((type) =>
          imagesClient.listImages({ organizationId, type, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
        ),
      );
      const seen = new Set<string>();
      return pages
        .flatMap((page) => page.images)
        .filter((image) => {
          const id = image.meta?.id ?? '';
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
    },
  });

  const images = useMemo(() => listed.data ?? [], [listed.data]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full" data-testid={`${testIdPrefix}-image-trigger`}>
          <SelectValue placeholder={listed.isPending ? 'Loading images…' : 'Select an image'} />
        </SelectTrigger>
        <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)]">
          {images.map((image) => (
            <SelectItem key={image.meta?.id} value={image.meta?.id ?? ''}>
              <span className="block truncate">{imageLabel(image, organizationId)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!listed.isPending && images.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-image-empty`}>
          No images of this type are available. Register one under Runtime → Images.
        </p>
      ) : null}
    </div>
  );
}
