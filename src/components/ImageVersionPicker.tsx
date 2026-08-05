import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { ComboboxInput, type ComboboxOption } from '@/components/ComboboxInput';
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

  // Semver tags are the list and everything else sits behind "show all" - but
  // a repository that publishes no semver at all would then offer nothing, so
  // there is nothing to hold back.
  const hasReleases = release.length > 0;
  const shown = showAll || !hasReleases ? [...release, ...other] : release;

  return (
    <div className="space-y-1" data-testid={`${testIdPrefix}-version-picker`}>
      <ComboboxInput
        value={value}
        onValueChange={onChange}
        options={shown.map(toOption)}
        disabled={disabled || !imageId}
        placeholder={refreshed.isPending ? 'Loading versions…' : 'Select or type a version'}
        emptyMessage={refreshed.isPending ? 'Loading versions…' : 'No matching version'}
        // Inside the list: revealing the rest is about the list, and a button
        // beside the field would appear the moment an image is chosen and push
        // everything below it down.
        footer={
          hasReleases && other.length > 0 && !showAll ? (
            <button
              type="button"
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
              onClick={() => setShowAll(true)}
              data-testid={`${testIdPrefix}-show-all-tags`}
            >
              Show all tags ({other.length})
            </button>
          ) : null
        }
        data-testid={`${testIdPrefix}-version`}
      />
    </div>
  );
}
