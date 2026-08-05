import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { ComboboxInput } from '@/components/ComboboxInput';
import { type ImageType, ImageVisibility, type Image } from '@/gen/agynio/api/images/v1/images_pb';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

type ImagePickerProps = {
  organizationId: string;
  // The slot decides which images are worth showing. An MCP takes either a
  // purpose-built server image or a devcontainer, so it passes both.
  types: ImageType[];
  value: string;
  onChange: (imageId: string) => void;
  disabled?: boolean;
  testIdPrefix: string;
};

// What the name alone does not say. A public image from another organization is
// usable but not yours, and stored versions are still served while a registry is
// unreachable - which explains a tag list that looks behind.
const imageDescription = (image: Image, organizationId: string) => {
  const parts: string[] = [];
  if (image.description?.trim()) parts.push(image.description.trim());
  if (image.visibility === ImageVisibility.PUBLIC && image.organizationId !== organizationId) {
    parts.push(`shared by ${image.organizationSlug}`);
  }
  if (image.staleSince) parts.push('registry unreachable');
  return parts.join(' · ');
};

export function ImagePicker({
  organizationId,
  types,
  value,
  onChange,
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

  // The field shows a name while the caller stores an id, so the text is its
  // own state: deriving it from the id would erase each keystroke that does not
  // yet spell a whole name.
  const [text, setText] = useState('');
  const selectedName = images.find((image) => image.meta?.id === value)?.name ?? '';
  useEffect(() => setText(selectedName), [selectedName]);

  return (
    <div className="space-y-1">
      <ComboboxInput
        value={text}
        onValueChange={(name) => {
          setText(name);
          // Only a whole name is a selection; anything else is still being
          // typed and leaves the stored id alone until it resolves.
          const match = images.find((image) => image.name === name);
          if (match) onChange(match.meta?.id ?? '');
          else if (value) onChange('');
        }}
        options={images.map((image) => ({
          value: image.name,
          label: image.name,
          description: imageDescription(image, organizationId),
        }))}
        disabled={disabled}
        placeholder={listed.isPending ? 'Loading images…' : 'Select an image'}
        emptyMessage={listed.isPending ? 'Loading images…' : 'No matching image'}
        data-testid={`${testIdPrefix}-image`}
      />
      {!listed.isPending && images.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testIdPrefix}-image-empty`}>
          No images of this type are available. Register one under Runtime → Images.
        </p>
      ) : null}
    </div>
  );
}
