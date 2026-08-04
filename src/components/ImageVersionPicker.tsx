import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const versionLabel = (version: ImageVersion) => {
  // A tag is not a bare string: its push time and description are what make a
  // row readable.
  const pushed = version.pushedAt ? formatDateOnly(version.pushedAt) : '';
  const description = version.description?.trim();
  const suffix = [pushed, description].filter(Boolean).join(' · ');
  return suffix ? `${version.tag} — ${suffix}` : version.tag;
};

/**
 * Selects a tag within an image. Opening it refreshes the image, so a tag
 * pushed upstream a moment ago is selectable without waiting for the poll.
 */
export function ImageVersionPicker({
  imageId,
  value,
  onChange,
  disabled,
  testIdPrefix,
}: ImageVersionPickerProps) {
  const [showAll, setShowAll] = useState(false);
  const [typed, setTyped] = useState('');

  const refreshed = useQuery({
    queryKey: ['image-versions', imageId],
    enabled: Boolean(imageId),
    queryFn: () => imagesClient.refreshImage({ imageId }),
    staleTime: 30_000,
  });

  const versions = useMemo(() => refreshed.data?.versions ?? [], [refreshed.data]);
  const { release, other } = useMemo(() => groupVersions(versions), [versions]);

  // Preselect the newest so the common case needs no decision at all. Only
  // when the caller has not already chosen one.
  useEffect(() => {
    if (value || versions.length === 0) return;
    const preselected = preselectedTag(versions);
    if (preselected) onChange(preselected);
  }, [value, versions, onChange]);

  const shown = showAll ? [...release, ...other] : release;
  // A tag the caller already holds must stay selectable even if discovery no
  // longer lists it, or editing an unrelated field would silently change it.
  const missingCurrent = value && !shown.some((version) => version.tag === value);

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-version-picker`}>
      <Label>Version</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled || !imageId}>
        <SelectTrigger data-testid={`${testIdPrefix}-version-trigger`}>
          <SelectValue placeholder={refreshed.isPending ? 'Loading versions…' : 'Select a version'} />
        </SelectTrigger>
        <SelectContent>
          {missingCurrent ? (
            <SelectItem value={value}>{value} — not currently listed upstream</SelectItem>
          ) : null}
          {shown.map((version) => (
            <SelectItem key={version.tag} value={version.tag}>
              {versionLabel(version)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs font-normal text-muted-foreground">
            Or type a tag — it is checked against the repository before it is accepted
          </Label>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="1.2.3"
            disabled={disabled || !imageId}
            data-testid={`${testIdPrefix}-version-typed`}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !typed.trim()}
          onClick={() => {
            onChange(typed.trim());
            setTyped('');
          }}
          data-testid={`${testIdPrefix}-version-use-typed`}
        >
          Use
        </Button>
      </div>
    </div>
  );
}
