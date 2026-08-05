import { ImagePicker } from '@/components/ImagePicker';
import { ImageVersionPicker } from '@/components/ImageVersionPicker';
import { Label } from '@/components/ui/label';
import type { ImageType } from '@/gen/agynio/api/images/v1/images_pb';

type ImageSelectorProps = {
  organizationId: string;
  types: ImageType[];
  label: string;
  description?: string;
  imageId: string;
  imageTag: string;
  onChange: (imageId: string, imageTag: string) => void;
  disabled?: boolean;
  testIdPrefix: string;
};

/**
 * One image reference: which image, and which of its versions.
 *
 * They are a single field under one heading rather than two stacked controls.
 * Separately labelled, a form with two image slots shows two headings called
 * Version with nothing saying which image either belongs to.
 */
export function ImageSelector({
  organizationId,
  types,
  label,
  description,
  imageId,
  imageTag,
  onChange,
  disabled,
  testIdPrefix,
}: ImageSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
        <ImagePicker
          organizationId={organizationId}
          types={types}
          value={imageId}
          // A tag belongs to the image it was chosen in, so changing the image
          // clears it and the version field preselects afresh.
          onChange={(nextImageId) => onChange(nextImageId, '')}
          disabled={disabled}
          testIdPrefix={testIdPrefix}
        />
        <ImageVersionPicker
          imageId={imageId}
          value={imageTag}
          onChange={(tag) => onChange(imageId, tag)}
          disabled={disabled || !imageId}
          testIdPrefix={testIdPrefix}
        />
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
