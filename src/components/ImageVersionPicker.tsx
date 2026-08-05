import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ComboboxInput, type ComboboxOption } from '@/components/ComboboxInput';
import { Label } from '@/components/ui/label';
import type { ImageVersion } from '@/gen/agynio/api/images/v1/images_pb';
import { formatDateOnly } from '@/lib/format';
import { groupVersions, preselectedTag } from '@/lib/image-versions';

type ImageVersionPickerProps = {
  imageId: string;
  value: string;
  onChange: (tag: string) => void;
  disabled?: boolean;
  testIdPrefix: string;
};

const toOption = (version: ImageVersion): ComboboxOption => ({
  value: version.tag,
  label: version.tag,
  description: [version.pushedAt ? formatDateOnly(version.pushedAt) : '', version.description?.trim()]
    .filter(Boolean)
    .join(' · '),
});

/**
 * Selects a tag within an image. Opening it refreshes the image, so a tag
 * pushed upstream a moment ago is selectable without waiting for the poll.
 *
 * One field rather than a list beside a text box: picking from the list is the
 * ordinary path, and typing is for someone who already knows which tag they
 * want in a repository holding more of them than a list should show.
 */
export function ImageVersionPicker({
  imageId,
  value,
  onChange,
  disabled,
  testIdPrefix,
}: ImageVersionPickerProps) {
  const [showAll, setShowAll] = useState(false);
  // Preselection is a starting point, not a floor. Keyed by image so choosing a
  // different one preselects again, while clearing the field leaves it clear.
  const preselectedFor = useRef('');

  const refreshed = useQuery({
    queryKey: ['image-versions', imageId],
    enabled: Boolean(imageId),
    queryFn: () => imagesClient.refreshImage({ imageId }),
    staleTime: 30_000,
  });

  const versions = useMemo(() => refreshed.data?.versions ?? [], [refreshed.data]);
  const { release, other } = useMemo(() => groupVersions(versions), [versions]);

  // Preselect the newest so the common case needs no decision at all.
  useEffect(() => {
    if (!imageId || versions.length === 0 || preselectedFor.current === imageId) return;
    preselectedFor.current = imageId;
    if (value) return;
    const preselected = preselectedTag(versions);
    if (preselected) onChange(preselected);
  }, [imageId, value, versions, onChange]);

  const shown = showAll ? [...release, ...other] : release;

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-version-picker`}>
      <Label>Version</Label>
      <ComboboxInput
        value={value}
        onValueChange={onChange}
        options={shown.map(toOption)}
        disabled={disabled || !imageId}
        placeholder={refreshed.isPending ? 'Loading versions…' : 'Select or type a version'}
        emptyMessage={refreshed.isPending ? 'Loading versions…' : 'No matching version'}
        data-testid={`${testIdPrefix}-version`}
      />

      {other.length > 0 && !showAll ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(true)}
          data-testid={`${testIdPrefix}-show-all-tags`}
        >
          Show all tags ({other.length})
        </Button>
      ) : null}
    </div>
  );
}
